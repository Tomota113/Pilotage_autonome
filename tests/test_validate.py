"""Tests du validateur du contrat de données (tools/validate.py)."""

import copy
import csv
import json
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

from tests.conftest import circle_track_dict
from tools.validate import EVAL_COLUMNS, main, validate_config, validate_replay

ROOT = Path(__file__).resolve().parent.parent


def valid_replay() -> dict:
    frame = {
        "t": 0.05, "x": 0.0, "y": 0.0, "psi": 0.0, "v": 0.5, "delta": 0.0,
        "action": {"steer": 0.0, "throttle": 1.0, "brake": 0.0},
        "obs": [0.0] * 12, "sensors_m": [6.0, 7.0, 12.0, 100.0, 12.0, 7.0, 6.0],
        "progress": 0.0, "checkpoint": 0, "reward": 0.0, "slip": False, "off_track": False,
    }
    second = dict(frame, t=0.10)
    return {
        "schema": "f1rl.replay/1.1", "run_id": "classic_demo",
        "agent": {"algo": "classic", "checkpoint": "none", "train_steps": 0},
        "track_id": "demo_oval", "mu_factor": 1.0, "seed": 0, "dt": 0.05,
        "frames": [frame, second],
        "summary": {"outcome": "timeout", "lap_time": None, "total_reward": 0.0, "steps": 2, "off_tracks": 0},
    }


def valid_config() -> dict:
    return {
        "schema": "f1rl.config/1.1", "algo": "ppo", "seed": 0, "total_steps": 1000000, "n_envs": 1,
        "tracks": {"train": ["gen_00", "gen_01"], "test": ["gen_10"]},
        "mu": {"mode": "fixed", "value": 1.0, "range": [0.5, 1.1]},
        "env": {"dt": 0.05, "action_repeat": 5, "action_space": "continuous", "max_steps": 3000,
                "stall_steps": 100, "observe_mu": False},
        "reward": {"k_progress": 0.1, "c_time": 0.01, "p_offtrack": 10.0, "b_lap": 50.0, "lambda_steer": 0.05},
        "hyperparams": {}, "checkpoint_every": 50000, "eval_every": 50000, "eval_episodes": 5,
    }


def eval_row(**changes) -> dict:
    row = {
        "run_id": "classic_demo", "algo": "classic", "seed": "0", "mu_mode": "fixed", "checkpoint": "none",
        "track_id": "gen_10", "split": "test", "mu_factor": "1.0", "episode": "0", "outcome": "lap",
        "lap_time": "52.4", "total_reward": "131.7", "steps": "1048", "offtracks": "0", "replay_path": "",
    }
    row.update(changes)
    return row


def write_csv(path, rows, columns=EVAL_COLUMNS):
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def test_valid_replay_and_config_pass():
    validate_replay(valid_replay())
    validate_config(valid_config())


@pytest.mark.parametrize(
    "corrupt",
    [
        lambda d: d.update(schema="f1rl.replay/2.0"),
        lambda d: d["summary"].update(outcome="crash"),
        lambda d: d["summary"].update(lap_time=50.0),  # temps au tour sans tour valide
        lambda d: d["summary"].update(steps=3),
        lambda d: d["frames"][0].pop("sensors_m"),
        lambda d: d["frames"][1].update(t=0.0),
        lambda d: d["agent"].update(algo="a2c"),
    ],
    ids=["schema", "outcome", "lap_time", "steps", "frame_field", "time_order", "algo"],
)
def test_invalid_replay_is_rejected(corrupt):
    data = valid_replay()
    corrupt(data)
    with pytest.raises(ValueError):
        validate_replay(data)


@pytest.mark.parametrize(
    "corrupt",
    [
        lambda c: c.update(schema="f1rl.config/0.9"),
        lambda c: c.update(algo="a2c"),
        lambda c: c["mu"].update(mode="random"),
        lambda c: c["mu"].update(range=[1.1, 0.5]),
        lambda c: c["env"].pop("stall_steps"),
        lambda c: c.update(algo="dqn"),  # DQN exige discrete9
        lambda c: c["tracks"].update(train=[]),
    ],
    ids=["schema", "algo", "mu_mode", "mu_range", "env_field", "dqn_continuous", "no_train_track"],
)
def test_invalid_config_is_rejected(corrupt):
    cfg = copy.deepcopy(valid_config())
    corrupt(cfg)
    with pytest.raises(ValueError):
        validate_config(cfg)


def test_cli_exit_code(tmp_path):
    good = {
        "track.json": json.dumps(circle_track_dict()),
        "replay.json": json.dumps(valid_replay()),
        "config.yaml": yaml.safe_dump(valid_config()),
    }
    for name, text in good.items():
        (tmp_path / name).write_text(text, encoding="utf-8")
    write_csv(tmp_path / "eval.csv", [eval_row(), eval_row(outcome="off_track", lap_time="")])
    good_paths = [str(tmp_path / n) for n in (*good, "eval.csv")]
    assert main(good_paths) == 0

    write_csv(tmp_path / "bad_eval.csv", [eval_row(outcome="off_track")])  # lap_time sans tour
    write_csv(tmp_path / "bad_cols.csv", [], columns=EVAL_COLUMNS[:-1])
    bad_track = circle_track_dict()
    bad_track["checkpoints"] = bad_track["checkpoints"][:5]
    (tmp_path / "bad_track.json").write_text(json.dumps(bad_track), encoding="utf-8")
    for name in ("bad_eval.csv", "bad_cols.csv", "bad_track.json"):
        assert main([str(tmp_path / name)]) == 1


def test_script_validates_committed_tracks():
    """`python tools/validate.py tracks/*.json` fonctionne lancé comme un script."""
    tracks = sorted(str(p) for p in (ROOT / "tracks").glob("*.json"))
    result = subprocess.run([sys.executable, "tools/validate.py", *tracks], cwd=ROOT, capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout.count("OK") == len(tracks) == 16


def test_schema_1_1_adds_tabular_algorithms_and_keeps_1_0():
    cfg = valid_config()
    cfg["schema"] = "f1rl.config/1.0"
    validate_config(cfg)  # ancienne version, ancien algorithme : toujours valide
    cfg.update(algo="sarsa")
    cfg["env"]["action_space"] = "discrete9"
    with pytest.raises(ValueError, match="1.1"):
        validate_config(cfg)  # sarsa n'existe pas en 1.0
    cfg["schema"] = "f1rl.config/1.1"
    validate_config(cfg)
    cfg["env"]["action_space"] = "continuous"
    with pytest.raises(ValueError):
        validate_config(cfg)  # méthode tabulaire : discrete9 obligatoire

    replay = valid_replay()
    replay["schema"] = "f1rl.replay/1.0"
    validate_replay(replay)
    replay["agent"]["algo"] = "montecarlo"
    with pytest.raises(ValueError):
        validate_replay(replay)
