"""Exercise the Training Center with local data and real child processes."""

import shutil
import time
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from server.app import create_app
from tests.test_validate import valid_config
from tools.validate import FRAME_NUMBERS, SUMMARY_FIELDS

REPO_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def client(tmp_path, monkeypatch):
    tracks = tmp_path / "tracks"
    tracks.mkdir()
    shutil.copyfile(REPO_ROOT / "tracks" / "demo_oval.json", tracks / "demo_oval.json")
    monkeypatch.setenv("F1RL_ROOT", str(tmp_path))
    monkeypatch.setenv("OMP_NUM_THREADS", "1")
    monkeypatch.setenv("MKL_NUM_THREADS", "1")
    # La boucle d'Uvicorn permet aussi à TestClient de tourner dans le bac à sable.
    with TestClient(create_app(), backend_options={"use_uvloop": True}) as test_client:
        yield test_client


def short_config(total_steps=160):
    config = valid_config()
    config.update(total_steps=total_steps, checkpoint_every=64, eval_every=64, eval_episodes=1,
                  hyperparams={"n_steps": 32, "batch_size": 16})
    config["tracks"] = {"train": ["demo_oval"], "test": ["demo_oval"]}
    config["env"].update(max_steps=12)
    return config


def start_run(client, config):
    response = client.post("/runs", content=yaml.safe_dump(config))
    assert response.status_code == 200, response.text
    assert response.json()["state"] in ("queued", "running")
    return response.json()["run_id"]


def wait_for_run(client, run_id, predicate):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        run = next(row for row in client.get("/runs").json() if row["run_id"] == run_id)
        assert run["state"] != "failed", client.get(f"/files/runs/_logs/{run_id}.log").text
        if predicate(run):
            return run
        time.sleep(0.05)
    pytest.fail(f"Timed out waiting for {run_id}")


def test_rejects_invalid_yaml_and_paths(client, tmp_path):
    response = client.post("/runs", content="schema: no")
    assert response.status_code == 400 and response.json()["detail"]
    config = short_config()
    (tmp_path / "outside.json").write_text("{}", encoding="utf-8")
    (tmp_path / "tracks" / "linked.json").symlink_to(tmp_path / "outside.json")
    for track_id in ("../outside", "linked"):
        config["tracks"]["train"] = [track_id]
        assert client.post("/runs", content=yaml.safe_dump(config)).status_code == 400
    assert client.post("/runs/unknown/stop").status_code == 404
    assert client.get("/runs/_queue/checkpoints").status_code == 404
    assert client.get("/files/tracks/linked.json").status_code == 404
    with client.websocket_connect("/ws/runs/unknown") as websocket:
        assert websocket.receive_json()["type"] == "error"


def test_train_and_watch(client, tmp_path):
    config = short_config()
    run_id = start_run(client, config)
    with client.websocket_connect(f"/ws/runs/{run_id}") as websocket:
        status = websocket.receive_json()
        assert status["type"] == "status" and status["state"] in ("queued", "running")
        run = wait_for_run(client, run_id, lambda row: row["state"] == "finished")
        # condition None : essai court, hors des conditions du protocole
        assert run == {"run_id": run_id, "algo": "ppo", "seed": 0, "condition": None, "state": "finished",
                       "last_step": 160}
        checkpoints = client.get(f"/runs/{run_id}/checkpoints").json()
        assert [checkpoint["step"] for checkpoint in checkpoints] == [64, 128, 160]
        assert checkpoints[-1]["name"] == "step_160.zip" and all(item["size"] > 0 for item in checkpoints)

        updates = set()
        while updates != {"progress", "checkpoint", "status"}:
            message = websocket.receive_json()
            assert message["type"] != "error", message
            updates.add(message["type"])
            if message["type"] == "progress":
                assert message["run_id"] == run_id and isinstance(message["step"], int)
            elif message["type"] == "checkpoint":
                assert message["name"] == f"step_{message['step']}.zip"
            elif message["type"] == "status":
                assert message["state"] == "finished"

        watch = {"type": "watch_live", "checkpoint": "latest", "track_id": "demo_oval", "mu_factor": 1.0}
        websocket.send_json({**watch, "checkpoint": "../step_160.zip"})
        while (message := websocket.receive_json())["type"] != "error":
            assert message["type"] in ("progress", "checkpoint")
        assert "checkpoint" in message["message"].lower()

        websocket.send_json(watch)
        frame_keys = set(FRAME_NUMBERS) | {"action", "obs", "sensors_m", "checkpoint", "slip", "off_track", "type"}
        frames = []
        started = time.monotonic()
        while (message := websocket.receive_json())["type"] != "episode_end":
            assert message["type"] == "frame", message
            assert message.keys() == frame_keys
            assert message["action"].keys() == {"steer", "throttle", "brake"}
            assert len(message["obs"]) == 12 and len(message["sensors_m"]) == 7
            frames.append(message)
        assert len(frames) == message["summary"]["steps"] == 12
        assert message["summary"].keys() == set(SUMMARY_FIELDS)
        assert time.monotonic() - started >= len(frames) * 0.04

        # Une commande erronée sert de repère après l'arrêt d'une lecture en cours.
        websocket.send_json({**watch, "checkpoint": "step_160.zip"})
        assert websocket.receive_json()["type"] == "frame"
        websocket.send_json({"type": "stop_watch"})
        websocket.send_json({"type": "probe"})
        while (message := websocket.receive_json())["type"] == "frame":
            pass
        assert message["type"] == "error" and "Expected" in message["message"]

    track = client.get("/files/tracks/demo_oval.json")
    assert track.status_code == 200 and track.json()["id"] == "demo_oval"
    assert client.post("/files/tracks/demo_oval.json").status_code == 405
    saved = client.get(f"/files/runs/{run_id}/config.yaml")
    assert saved.status_code == 200 and yaml.safe_load(saved.content) == config
    assert client.get(f"/files/runs/_logs/{run_id}.log").status_code == 200
    (tmp_path / "results" / "eval.csv").write_text("run_id\n", encoding="utf-8")
    assert client.get("/files/results/eval.csv").text == "run_id\n"


def test_stop_training(client, tmp_path):
    # Ce nom de fichier n'existe que sous F1RL_ROOT.
    tracks = tmp_path / "tracks"
    shutil.copyfile(tracks / "demo_oval.json", tracks / "local_oval.json")
    config = short_config(total_steps=10_000_000)
    config["tracks"]["train"] = ["local_oval"]
    run_id = start_run(client, config)
    wait_for_run(client, run_id, lambda row: row["last_step"] is not None)
    with client.websocket_connect(f"/ws/runs/{run_id}") as websocket:
        assert websocket.receive_json() == {"type": "status", "state": "running"}
        stopped = client.post(f"/runs/{run_id}/stop")
        assert stopped.status_code == 200 and stopped.json()["state"] == "stopping"
        states = []
        while states != ["stopping", "finished"]:
            message = websocket.receive_json()
            assert message["type"] != "error", message
            if message["type"] == "status":
                states.append(message["state"])
                assert states == ["stopping", "finished"][:len(states)]
    assert client.post(f"/runs/{run_id}/stop").json()["state"] == "finished"


def test_lists_tracks(client, tmp_path):
    (tmp_path / "tracks" / "broken.json").write_text("{", encoding="utf-8")  # illisible : ignoré
    tracks = client.get("/tracks").json()
    assert tracks == [{"id": "demo_oval", "name": "Ovale de démonstration", "split": "demo", "length": 976.9}]


def test_root_serves_the_built_app_or_explains(client, monkeypatch, tmp_path):
    response = client.get("/")
    assert response.status_code == 200
    import server.app as server_app

    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>F1-RL Lab</title>", encoding="utf-8")
    monkeypatch.setattr(server_app, "APP_DIST", dist)
    with TestClient(create_app(), backend_options={"use_uvloop": True}) as app_client:
        assert "F1-RL Lab" in app_client.get("/").text
        assert app_client.get("/tracks").status_code == 200  # l'API reste prioritaire


def test_lists_replays_with_metadata(client, tmp_path):
    from agents.evaluate import evaluate

    rows = evaluate("classic", ["demo_oval"], [1.0], run_id="classic_ref", eval_csv=tmp_path / "eval.csv",
                    runs_dir=tmp_path / "runs")
    replays = client.get("/replays").json()
    assert len(replays) == 1
    r = replays[0]
    assert r["path"] == rows[0]["replay_path"] and r["condition"] == "classic" and r["algo"] == "classic"
    assert r["car"] == "v1"
    assert r["track_id"] == "demo_oval" and r["mu_factor"] == 1.0 and r["outcome"] == "lap"
    assert r["lap_time"] == rows[0]["lap_time"] and r["has_activations"] is False


def test_replay_car_comes_from_run_config_or_reference_id(client, tmp_path):
    cases = [
        ("classic_f1_ref", None, "classic", "f1_2024"),
        ("raceline_f1_ref", None, "raceline", "f1_2024"),
        ("raceline_ref", None, "raceline", "v1"),
        ("ppo_run_legacy", {}, None, "v1"),
        ("ppo_run_modern", {"car": "f1_2024"}, None, "f1_2024"),
    ]
    for run_id, env, condition, _ in cases:
        run = tmp_path / "runs" / run_id
        (run / "replays").mkdir(parents=True)
        algo = "classic" if condition else "ppo"
        (run / "replays" / f"{algo}_none_demo_oval_mu1.00_ep0.json").write_text(
            '{"summary": {"outcome": "lap"}}', encoding="utf-8")
        if env is not None:
            config = short_config()
            config["env"].pop("car", None)
            config["env"].update(env)
            (run / "config.yaml").write_text(yaml.safe_dump(config), encoding="utf-8")

    response = client.get("/replays")
    assert response.status_code == 200
    assert {r["run_id"]: (r["condition"], r["car"]) for r in response.json()} == {
        run_id: (condition, car) for run_id, _, condition, car in cases
    }
    assert all(r["algo"] == "classic" for r in response.json() if r["condition"])


def test_raceline_endpoint(client):
    data = client.get("/tracks/demo_oval/raceline", params={"mu": 0.8}).json()
    assert data["track_id"] == "demo_oval" and data["mu"] == 0.8
    assert len(data["points"]) == len(data["speed"]) > 50
    assert 0 < data["lap_time_s"] < 60  # ovale de 977 m
    assert client.get("/tracks/../raceline").status_code in (400, 404)
    assert client.get("/tracks/unknown/raceline").status_code == 404
    assert client.get("/tracks/demo_oval/raceline", params={"mu": -1}).status_code == 400
    assert client.get("/tracks/demo_oval/raceline", params={"car": "unknown"}).status_code == 400


def test_raceline_f1_is_faster_than_v1(client):
    url = "/tracks/demo_oval/raceline"
    v1 = client.get(url).json()
    response = client.get(url, params={"car": "f1_2024"})
    assert response.status_code == 200
    f1 = response.json()
    assert f1["points"] == v1["points"]
    assert max(f1["speed"]) > max(v1["speed"])
    assert 0 < f1["lap_time_s"] < v1["lap_time_s"]
    assert client.get(url, params={"car": "v1"}).json() == v1
