"""Training, progress and replay endpoints for the Training Center."""

from __future__ import annotations

import asyncio
import csv
import json
import math
import os
import re
import signal
import subprocess
import sys
import tempfile
import zipfile
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import yaml
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from agents.train import PROGRESS_COLUMNS, make_run_id
from env.f1_env import CAR_MODELS
from tools.validate import validate_config

REPO_ROOT = Path(__file__).resolve().parents[1]
APP_DIST = REPO_ROOT / "app" / "dist"
POLL_INTERVAL = 0.1
STOP_TIMEOUT = 2.0
FRAME_INTERVAL = 1 / 20
COMPONENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,239}")
CHECKPOINT = re.compile(r"step_([0-9]{1,20})\.(zip|npy|pt)")
# algo : td3 (chiffre) et deep_sarsa / deep_mc (tiret bas) compris
REPLAY_NAME = re.compile(r"(?P<algo>[a-z][a-z0-9]*(?:_[a-z]+)?)_(?P<checkpoint>step_[0-9]+|none)_(?P<track>[a-z0-9_]+)"
                         r"_mu(?P<mu>[0-9.]+)_ep(?P<episode>[0-9]+)\.json")
SUMMARY = re.compile(r'"summary":\s*\{([^{}]*)\}\s*\}\s*$')


def local_path(path: Path) -> Path:
    """Require an absolute path with no symlink below the resolved root."""
    if path.resolve() != path:
        raise ValueError(f"Unexpected path: {path.name}")
    return path


def read_progress(path: Path, offset: int = 0) -> tuple[list[dict], int]:
    rows = []
    try:
        stream = local_path(path).open(encoding="utf-8", newline="")
    except FileNotFoundError:
        return rows, 0
    with stream:
        header = stream.readline()
        if not header.endswith("\n"):
            return rows, 0
        if tuple(next(csv.reader([header]))) != PROGRESS_COLUMNS:
            raise ValueError("Invalid progress.csv columns")
        if offset:
            stream.seek(offset)
        offset = stream.tell()
        while (line := stream.readline()).endswith("\n"):
            # Une ligne en cours d'écriture sera relue au prochain passage.
            cells = next(csv.reader([line]))
            if len(cells) != len(PROGRESS_COLUMNS):
                raise ValueError("Invalid progress.csv row")
            row = dict(zip(PROGRESS_COLUMNS, cells))
            for key in ("seed", "step"):
                row[key] = int(row[key])
            for key in PROGRESS_COLUMNS[5:]:
                row[key] = float(row[key]) if row[key] else None
                if row[key] is not None and not math.isfinite(row[key]):
                    raise ValueError(f"Invalid progress.csv value: {key}")
            rows.append(row)
            offset = stream.tell()
    return rows, offset


def list_checkpoints(run_dir: Path, active: bool) -> list[dict]:
    directory = local_path(run_dir / "checkpoints")
    if not directory.is_dir():
        return []
    checkpoints = []
    for path in directory.iterdir():
        match = CHECKPOINT.fullmatch(path.name)
        if not match or path.is_symlink() or not path.is_file():
            continue
        # Le répertoire ZIP n'est lisible qu'à la fin de l'écriture. Le .npy est sauvegardé à la sortie.
        if active and (path.suffix == ".npy" or not zipfile.is_zipfile(path)):
            continue
        checkpoints.append({"name": path.name, "step": int(match[1]), "size": path.stat().st_size})
    return sorted(checkpoints, key=lambda checkpoint: (checkpoint["step"], checkpoint["name"]))


@dataclass
class Training:
    config: dict
    process: subprocess.Popen
    states: list[str] = field(default_factory=lambda: ["running"])
    stop_deadline: float | None = None
    task: asyncio.Task | None = None

    @property
    def state(self) -> str:
        return self.states[-1]

    def stop(self) -> None:
        if self.state == "running" and self.process.poll() is None:
            self.states.append("stopping")
            self.stop_deadline = asyncio.get_running_loop().time() + STOP_TIMEOUT
            self.process.terminate()

    async def reap(self, queued_config: Path) -> None:
        try:
            while (code := self.process.poll()) is None:
                if self.stop_deadline is not None and asyncio.get_running_loop().time() >= self.stop_deadline:
                    self.process.kill()
                    self.stop_deadline = None
                await asyncio.sleep(POLL_INTERVAL)
            stopped = self.state == "stopping" and code in (-signal.SIGTERM, -signal.SIGKILL)
            self.states.append("finished" if code == 0 or stopped else "failed")
        finally:
            queued_config.unlink(missing_ok=True)


async def stream_watch(websocket: WebSocket, process: asyncio.subprocess.Process) -> None:
    try:
        while line := await process.stdout.readline():
            message = json.loads(line)
            await websocket.send_json(message)
            if message["type"] == "frame":
                await asyncio.sleep(FRAME_INTERVAL)
        if await process.wait():
            await websocket.send_json({"type": "error", "message": "Evaluation process failed"})
    except (OSError, ValueError) as exc:
        await terminate_watch(process)
        await websocket.send_json({"type": "error", "message": str(exc)})


async def terminate_watch(process: asyncio.subprocess.Process) -> None:
    if process.returncode is None:
        try:
            process.terminate()
        except ProcessLookupError:
            pass
    try:
        await asyncio.wait_for(process.communicate(), timeout=STOP_TIMEOUT)
    except TimeoutError:
        if process.returncode is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass
        await process.communicate()


async def cancel_task(task: asyncio.Task | None) -> None:
    if task is not None:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


async def stop_watch(watch: tuple[asyncio.subprocess.Process, asyncio.Task] | None) -> None:
    if watch is not None:
        process, task = watch
        await cancel_task(task)
        await terminate_watch(process)


def create_app(root: Path | None = None) -> FastAPI:
    """Build a standalone application with its own data root and child processes."""
    root = Path(root or os.environ.get("F1RL_ROOT", REPO_ROOT)).resolve()
    runs = root / "runs"
    tracks = root / "tracks"
    queue = runs / "_queue"
    logs = runs / "_logs"
    jobs: dict[str, Training] = {}
    child_env = {**os.environ, "PYTHONPATH": str(REPO_ROOT), "PYTHONDONTWRITEBYTECODE": "1"}

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        for directory in (runs, tracks, root / "results", queue, logs):
            local_path(directory).mkdir(parents=True, exist_ok=True)
        try:
            yield
        finally:
            for job in jobs.values():
                job.stop()
            await asyncio.gather(*(job.task for job in jobs.values()))

    application = FastAPI(lifespan=lifespan)
    for name in ("tracks", "runs", "results"):
        application.mount(f"/files/{name}", StaticFiles(directory=root / name, check_dir=False), name=name)

    def config_file(run_id: str) -> Path:
        if COMPONENT.fullmatch(run_id):
            path = runs / run_id / "config.yaml"
            if path.is_file() and path.resolve() == path:
                return path
        raise HTTPException(404, "Unknown run")

    def run_state(run_id: str) -> str:
        if job := jobs.get(run_id):
            return job.state
        config_file(run_id)
        return "finished"

    @application.post("/runs")
    async def start_run(request: Request):
        try:
            content = (await request.body()).decode("utf-8")
            config = yaml.safe_load(content)
            validate_config(config)
            if config["algo"] == "classic":
                raise ValueError("The classic driver has no training run")
            for split in ("train", "test"):
                for track_id in config["tracks"][split]:
                    if not COMPONENT.fullmatch(track_id):
                        raise ValueError(f"Invalid track ID: {track_id!r}")
                    path = local_path(tracks / f"{track_id}.json")
                    if split == "train" and not path.is_file():
                        raise ValueError(f"Unknown training track: {track_id}")
            if log_dir := config["hyperparams"].get("tensorboard_log"):
                if not (root / log_dir).resolve().is_relative_to(root):
                    raise ValueError("tensorboard_log must stay inside the data root")
            run_id = make_run_id(config)
            if not COMPONENT.fullmatch(run_id):
                raise ValueError("Invalid generated run ID")
        except (OSError, ValueError, TypeError, OverflowError, yaml.YAMLError) as exc:
            raise HTTPException(400, str(exc)) from exc

        log_path = logs / f"{run_id}.log"
        if run_id in jobs or (runs / run_id).exists() or (runs / run_id).is_symlink() or log_path.exists():
            raise HTTPException(409, "A run with this ID already exists")
        queued_config = None
        try:
            with tempfile.NamedTemporaryFile(dir=local_path(queue), suffix=".yaml", delete=False) as stream:
                queued_config = Path(stream.name)
                stream.write(content.encode("utf-8"))
            with local_path(log_path).open("xb") as log:
                process = subprocess.Popen(
                    [sys.executable, "-m", "agents.train", str(queued_config), "--runs-dir", str(runs),
                     "--run-id", run_id, "--tracks-dir", str(tracks)],
                    cwd=root, env=child_env, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                )
        except (OSError, ValueError) as exc:
            if queued_config is not None:
                queued_config.unlink(missing_ok=True)
            if isinstance(exc, FileExistsError):
                raise HTTPException(409, "A run with this ID already exists") from exc
            raise HTTPException(500, f"Could not launch training: {exc}") from exc
        job = jobs[run_id] = Training(config, process)
        job.task = asyncio.create_task(job.reap(queued_config))
        return {"run_id": run_id, "state": job.state}

    @application.get("/tracks")
    async def get_tracks():
        """Circuits available in <root>/tracks (id, name, split, length), for the application."""
        result = []
        for path in sorted(tracks.glob("*.json")):
            if not COMPONENT.fullmatch(path.stem) or path.is_symlink():
                continue
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                result.append({"id": data["id"], "name": data["name"], "split": data["split"],
                               "length": data["length"]})
            except (OSError, ValueError, KeyError, TypeError):
                continue  # fichier illisible : ignoré, validate.py dira pourquoi
        return result

    raceline_cache: dict[tuple[str, float, str], tuple[float, dict]] = {}

    @application.get("/tracks/{track_id}/raceline")
    async def get_raceline(track_id: str, mu: float = 1.0, car: str = "v1"):
        """Minimum-curvature racing line and fastest speed profile of a track (sim/raceline.py)."""
        from sim.raceline import racing_line, speed_profile
        from sim.track import Track

        if not COMPONENT.fullmatch(track_id) or not math.isfinite(mu) or not 0.1 <= mu <= 2.0:
            raise HTTPException(400, "Invalid track ID or mu")
        if car not in CAR_MODELS:
            raise HTTPException(400, "Unknown car")
        path = tracks / f"{track_id}.json"
        if not path.is_file() or path.is_symlink():
            raise HTTPException(404, "Unknown track")
        key, mtime = (track_id, round(mu, 3), car), path.stat().st_mtime
        if key not in raceline_cache or raceline_cache[key][0] != mtime:
            # Calcul en quelques dixièmes de seconde, hors de la boucle d'événements
            def compute():
                line = racing_line(Track.from_json(path))
                profile = speed_profile(line, mu, params=CAR_MODELS[car]["params"])
                return {"track_id": track_id, "mu": mu, "points": np.round(line.points, 2).tolist(),
                        "speed": np.round(profile.speed, 2).tolist(), "lap_time_s": round(profile.lap_time, 2),
                        "length_m": round(line.length, 1)}
            raceline_cache[key] = (mtime, await asyncio.to_thread(compute))
        return raceline_cache[key][1]

    replay_cache: dict[Path, tuple[float, dict]] = {}

    @application.get("/replays")
    async def get_replays():
        """Every replay under <root>/runs, with condition, car, track, mu and outcome."""
        from tools.make_configs import condition_of

        result, run_metadata = [], {}
        for path in sorted(runs.glob("*/replays/*.json")):
            run_id = path.parent.parent.name
            if not COMPONENT.fullmatch(run_id) or path.is_symlink():
                continue
            match = REPLAY_NAME.fullmatch(path.name)
            if not match:
                continue
            mtime = path.stat().st_mtime
            cached = replay_cache.get(path)
            if cached is None or cached[0] != mtime:
                with path.open("rb") as stream:
                    head = stream.read(8192)
                    stream.seek(max(0, path.stat().st_size - 1024))
                    tail = stream.read().decode("utf-8", "replace")
                # Le résumé est la dernière clé du fichier : inutile de lire les milliers d'images
                summary = SUMMARY.search(tail)
                info = json.loads("{" + summary.group(1) + "}") if summary else {}
                cached = (mtime, {"outcome": info.get("outcome"), "lap_time": info.get("lap_time"),
                                  "total_reward": info.get("total_reward"),
                                  "has_activations": b'"activations"' in head})
                replay_cache[path] = cached
            if run_id not in run_metadata:
                car, condition = "v1", None
                if run_id.startswith(("classic", "raceline")):
                    condition = "classic" if run_id.startswith("classic") else "raceline"
                    if "_f1_" in run_id:
                        car = "f1_2024"
                else:
                    try:
                        config = yaml.safe_load(config_file(run_id).read_text(encoding="utf-8"))
                        if isinstance(config, dict) and isinstance(config.get("env", {}), dict):
                            car = config.get("env", {}).get("car", "v1")
                            condition = condition_of(config)
                    except (HTTPException, OSError, ValueError, KeyError, TypeError, yaml.YAMLError):
                        pass
                run_metadata[run_id] = (car, condition)
            car, condition = run_metadata[run_id]
            result.append({"path": f"runs/{run_id}/replays/{path.name}", "run_id": run_id,
                           "condition": condition, "car": car, "algo": match["algo"],
                           "checkpoint": match["checkpoint"], "track_id": match["track"],
                           "mu_factor": float(match["mu"]), **cached[1]})
        return result

    @application.get("/runs")
    async def get_runs():
        run_ids = set(jobs) | {path.name for path in runs.iterdir() if COMPONENT.fullmatch(path.name)}
        result = []
        for run_id in sorted(run_ids):
            try:
                state = run_state(run_id)
            except HTTPException:
                continue
            config, last_step = {}, None
            try:
                if job := jobs.get(run_id):
                    config = job.config
                else:
                    config = yaml.safe_load(config_file(run_id).read_text(encoding="utf-8"))
                if not isinstance(config, dict):
                    raise ValueError("Invalid stored run configuration")
                rows, _ = read_progress(runs / run_id / "progress.csv")
                if rows:
                    last_step = rows[-1]["step"]
            except (OSError, ValueError, yaml.YAMLError):
                config = config if isinstance(config, dict) else {}
                state = "failed"
            try:
                from tools.make_configs import condition_of

                condition = condition_of(config) if config else None
            except (KeyError, TypeError):
                condition = None
            result.append({"run_id": run_id, "algo": config.get("algo"), "seed": config.get("seed"),
                           "condition": condition, "state": state, "last_step": last_step})
        return result

    @application.post("/runs/{run_id}/stop")
    async def stop_run(run_id: str):
        run_state(run_id)
        if job := jobs.get(run_id):
            job.stop()
        return {"run_id": run_id, "state": run_state(run_id)}

    @application.get("/runs/{run_id}/checkpoints")
    async def get_checkpoints(run_id: str):
        state = run_state(run_id)
        try:
            return list_checkpoints(runs / run_id, state in ("running", "stopping"))
        except (OSError, ValueError) as exc:
            raise HTTPException(500, f"Could not read checkpoints: {exc}") from exc

    async def monitor_run(websocket: WebSocket, run_id: str, state: str, state_index: int):
        offset, seen, last_error = 0, set(), None
        run_dir = runs / run_id
        job = jobs.get(run_id)
        while True:
            for state in job.states[state_index:] if job else ():
                await websocket.send_json({"type": "status", "state": state})
                state_index += 1
                if state == "failed":
                    await websocket.send_json({"type": "error", "message": f"Training failed. See _logs/{run_id}.log"})
            try:
                rows, offset = read_progress(run_dir / "progress.csv", offset)
                for row in rows:
                    await websocket.send_json({"type": "progress", **row})
                for checkpoint in list_checkpoints(run_dir, state in ("running", "stopping")):
                    name = checkpoint["name"]
                    if name not in seen:
                        await websocket.send_json({"type": "checkpoint", "name": name, "step": checkpoint["step"]})
                        seen.add(name)
                last_error = None
            except (OSError, ValueError) as exc:
                if str(exc) != last_error:
                    last_error = str(exc)
                    await websocket.send_json({"type": "error", "message": last_error})
            await asyncio.sleep(POLL_INTERVAL)

    async def start_watch(run_id: str, command: dict) -> asyncio.subprocess.Process:
        name = command.get("checkpoint", "latest")
        track_id = command.get("track_id")
        mu = command.get("mu_factor", 1.0)
        if not isinstance(name, str) or (name != "latest" and not CHECKPOINT.fullmatch(name)):
            raise ValueError("Invalid checkpoint name")
        if not isinstance(track_id, str) or not COMPONENT.fullmatch(track_id):
            raise ValueError("Invalid track ID")
        if isinstance(mu, bool) or not isinstance(mu, (int, float)) or not math.isfinite(mu) or mu <= 0:
            raise ValueError("mu_factor must be a finite positive number")
        if not local_path(tracks / f"{track_id}.json").is_file():
            raise ValueError("Unknown track")
        run_dir = config_file(run_id).parent
        checkpoints = list_checkpoints(run_dir, run_state(run_id) in ("running", "stopping"))
        selected = next((checkpoint for checkpoint in reversed(checkpoints)
                         if name in ("latest", checkpoint["name"])), None)
        if selected is None:
            raise ValueError("Checkpoint not available")
        checkpoint_path = local_path(run_dir / "checkpoints" / selected["name"])
        return await asyncio.create_subprocess_exec(
            sys.executable, "-m", "server.worker", "watch", str(checkpoint_path), track_id, str(mu),
            cwd=root, env={**child_env, "OMP_NUM_THREADS": "1", "MKL_NUM_THREADS": "1"},
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        )

    @application.websocket("/ws/runs/{run_id}")
    async def run_socket(websocket: WebSocket, run_id: str):
        await websocket.accept()
        monitor, watch = None, None
        try:
            state = run_state(run_id)
            job = jobs.get(run_id)
            state_index = len(job.states) if job else 0
            await websocket.send_json({"type": "status", "state": state})
            if state == "failed" and job:
                await websocket.send_json({"type": "error", "message": f"Training failed. See _logs/{run_id}.log"})
            monitor = asyncio.create_task(monitor_run(websocket, run_id, state, state_index))
            while True:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    break
                try:
                    command = json.loads(message.get("text") or "")
                    if not isinstance(command, dict) or command.get("type") not in ("watch_live", "stop_watch"):
                        raise ValueError("Expected watch_live or stop_watch")
                    await stop_watch(watch)
                    watch = None
                    if command["type"] == "watch_live":
                        process = await start_watch(run_id, command)
                        watch = process, asyncio.create_task(stream_watch(websocket, process))
                except (OSError, ValueError, OverflowError, HTTPException) as exc:
                    detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
                    await websocket.send_json({"type": "error", "message": detail})
        except HTTPException as exc:
            await websocket.send_json({"type": "error", "message": exc.detail})
            await websocket.close(code=1008)
        except WebSocketDisconnect:
            pass
        finally:
            await cancel_task(monitor)
            await stop_watch(watch)

    # L'application compilée (npm --prefix app run build) est servie à la racine : une seule
    # adresse, http://localhost:8000. Montée en dernier, elle ne masque aucune route de l'API.
    if (APP_DIST / "index.html").is_file():
        application.mount("/", StaticFiles(directory=APP_DIST, html=True), name="app")
    else:
        @application.get("/")
        async def root():
            return {"message": "API du Training Center. Application : tools/start_app.sh puis "
                               "http://localhost:5173, ou npm --prefix app run build puis http://localhost:8000"}

    return application


app = create_app()
