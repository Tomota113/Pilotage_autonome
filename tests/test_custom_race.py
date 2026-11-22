"""Verify that custom evaluations use the selected series and checkpoints."""

import csv
import json

import numpy as np
import pytest
import yaml

from agents.discretize import SCHEMES
from tests.conftest import circle_track_dict
from tools import custom_race
from tools.make_configs import make_config
from tools.validate import validate_replay


def write_run(runs_dir, condition, seed, lap_rate):
    config = make_config(condition, seed)
    car = config["env"].get("car", "v1")
    run = runs_dir / f"{condition}_s{seed}"
    checkpoints = run / "checkpoints"
    checkpoints.mkdir(parents=True)
    (run / "config.yaml").write_text(yaml.safe_dump(config), encoding="utf-8")
    (run / "progress.csv").write_text(f"step,lap_rate,mean_reward\n10,{lap_rate},1\n20,0,0\n", encoding="utf-8")
    for step in (10, 20):
        np.save(checkpoints / f"step_{step}.npy", np.zeros((SCHEMES[car].n_states, 9)))
    return run.name


@pytest.mark.parametrize(("car", "condition", "other_condition", "reference_ids"), [
    ("v1", "qlearning_mufixe", "qlearning_f1", {"classic_ref", "raceline_ref"}),
    ("f1_2024", "qlearning_f1", "qlearning_mufixe", {"classic_f1_ref", "raceline_f1_ref"}),
])
def test_race_on_track_selects_best_seed_and_checkpoint(tmp_path, monkeypatch, car, condition, other_condition,
                                                       reference_ids):
    track_id = "custom_circle"
    tracks = tmp_path / "tracks"
    tracks.mkdir()
    (tracks / f"{track_id}.json").write_text(json.dumps(dict(circle_track_dict(radius=12), id=track_id)),
                                             encoding="utf-8")
    runs = tmp_path / "runs"
    write_run(runs, condition, seed=0, lap_rate=0.2)
    winner = write_run(runs, condition, seed=1, lap_rate=0.8)
    write_run(runs, other_condition, seed=2, lap_rate=1.0)
    out = tmp_path / "results" / "eval_custom.csv"

    evaluate = custom_race.evaluation.evaluate

    def evaluate_short(*args, max_steps, **kwargs):
        assert max_steps == 6000
        return evaluate(*args, max_steps=4, **kwargs)

    monkeypatch.setattr(custom_race.evaluation, "evaluate", evaluate_short)
    assert custom_race.race_on_track(track_id, car, runs_dir=runs, eval_csv=out) == 3
    assert custom_race.race_on_track(track_id, car, (0.8,), runs_dir=runs, eval_csv=out) == 3

    with out.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    assert len(rows) == 6
    assert {row["track_id"] for row in rows} == {track_id}
    assert {row["run_id"] for row in rows} == reference_ids | {winner}
    assert {row["checkpoint"] for row in rows if row["run_id"] == winner} == {"step_10"}
    for row in rows:
        replay = json.loads((tmp_path / row["replay_path"]).read_text(encoding="utf-8"))
        validate_replay(replay)
        assert replay["track_id"] == track_id and replay["run_id"] == row["run_id"]
        assert replay["mu_factor"] == float(row["mu_factor"])
