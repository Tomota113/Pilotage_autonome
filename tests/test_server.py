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
    with TestClient(create_app()) as test_client:
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
        assert run == {"run_id": run_id, "algo": "ppo", "seed": 0, "state": "finished", "last_step": 160}
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


def test_stop_training(client):
    run_id = start_run(client, short_config(total_steps=10_000_000))
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
