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

import yaml
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from agents.train import PROGRESS_COLUMNS, make_run_id
from tools.validate import validate_config

REPO_ROOT = Path(__file__).resolve().parents[1]
POLL_INTERVAL = 0.1
STOP_TIMEOUT = 2.0
FRAME_INTERVAL = 1 / 20
COMPONENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,239}")
CHECKPOINT = re.compile(r"step_([0-9]{1,20})\.(zip|npy)")


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
        yield
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
            # La racine personnalisée change aussi la provenance des circuits.
            module = ["agents.train"] if root == REPO_ROOT else ["server.worker", "train"]
            with local_path(log_path).open("xb") as log:
                process = subprocess.Popen(
                    [sys.executable, "-m", *module, str(queued_config), "--runs-dir", str(runs), "--run-id", run_id],
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
                config = jobs[run_id].config if run_id in jobs else yaml.safe_load(config_file(run_id).read_text(encoding="utf-8"))
                if not isinstance(config, dict):
                    raise ValueError("Invalid stored run configuration")
                rows, _ = read_progress(runs / run_id / "progress.csv")
                if rows:
                    last_step = rows[-1]["step"]
            except (OSError, ValueError, yaml.YAMLError):
                config = config if isinstance(config, dict) else {}
                state = "failed"
            result.append({"run_id": run_id, "algo": config.get("algo"), "seed": config.get("seed"),
                           "state": state, "last_step": last_step})
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

    return application


app = create_app()
