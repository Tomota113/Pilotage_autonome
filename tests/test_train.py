"""Tests de l'entraînement (agents/train.py) : essais de quelques centaines de pas seulement.

Ils vérifient que la chaîne tourne et écrit les bons fichiers, pas qu'un agent apprend.
"""

import csv
from datetime import datetime

import pytest
import yaml

from agents.train import PROGRESS_COLUMNS, main, make_run_id
from tests.test_validate import valid_config
from tools.validate import validate_config


def test_run_id_format():
    cfg = valid_config()
    now = datetime(2026, 11, 20, 23, 5)
    assert make_run_id(cfg, now) == "ppo_multi_mufixe_s0_20261120-2305"
    cfg.update(algo="sac", seed=2)
    cfg["tracks"]["train"] = ["demo_oval"]
    cfg["mu"]["mode"] = "uniform"
    assert make_run_id(cfg, now) == "sac_demo_oval_mualea_s2_20261120-2305"


@pytest.mark.parametrize(
    "algo, action_space, hyperparams",
    [
        ("ppo", "continuous", {"n_steps": 128, "batch_size": 64}),
        ("dqn", "discrete9", {"learning_starts": 50}),
        ("sac", "continuous", {"learning_starts": 50}),
        ("sac", "pedal", {"learning_starts": 50}),
        ("td3", "pedal", {"learning_starts": 50}),
        ("tqc", "pedal", {"learning_starts": 50}),
        ("qrdqn", "discrete9", {"learning_starts": 50}),
    ],
)
def test_short_training_writes_run_files(tmp_path, algo, action_space, hyperparams):
    cfg = valid_config()
    cfg.update(algo=algo, hyperparams=hyperparams, checkpoint_every=150, eval_every=150, eval_episodes=1,
               schema="f1rl.config/1.3")
    cfg["tracks"]["train"] = ["demo_oval"]
    cfg["env"].update(action_space=action_space, max_steps=100)
    path = tmp_path / "cfg.yaml"
    path.write_text(yaml.safe_dump(cfg), encoding="utf-8")

    run_dir = main([str(path), "--steps", "300", "--runs-dir", str(tmp_path / "runs")])

    saved = yaml.safe_load((run_dir / "config.yaml").read_text(encoding="utf-8"))
    validate_config(saved)
    assert saved["total_steps"] == 300  # la copie garde la valeur réellement utilisée
    with open(run_dir / "progress.csv", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    assert tuple(reader.fieldnames) == PROGRESS_COLUMNS
    assert rows and all(r["run_id"] == run_dir.name and r["algo"] == algo for r in rows)
    steps = [int(r["step"]) for r in rows]
    assert steps == sorted(steps) and steps[-1] >= 300
    ckpts = sorted(p.name for p in (run_dir / "checkpoints").glob("step_*.zip"))
    assert ckpts and f"step_{steps[-1]}.zip" in ckpts

    # Réseau 2 × 64 pour tous les algorithmes
    from agents.evaluate import SB3Policy

    policy = SB3Policy(algo, run_dir / "checkpoints" / f"step_{steps[-1]}.zip", steps[-1], False)
    assert policy.network["layers"][1:-1] == [64, 64]


def test_steps_override_is_validated(tmp_path):
    path = tmp_path / "cfg.yaml"
    path.write_text(yaml.safe_dump(valid_config()), encoding="utf-8")
    with pytest.raises(ValueError, match="total_steps"):
        main([str(path), "--steps", "0", "--runs-dir", str(tmp_path / "runs")])
    assert not (tmp_path / "runs").exists()
