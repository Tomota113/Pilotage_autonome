"""Tests de la mission 8 : configurations, évaluation complète et figures.

Les runs créés ici sont des modèles NON entraînés dans tmp_path, et les
progress.csv sont des données de test écrites à la main : ils ne vérifient que
la chaîne de traitement et n'apparaissent dans aucun résultat.
"""

import csv
from pathlib import Path

import pytest
import yaml

from agents.train import PROGRESS_COLUMNS
from env.f1_env import F1Env, load_tracks
from tools.evaluate_all import evaluate_all, find_runs
from tools.make_configs import CONDITIONS, SEEDS, condition_of, make_config
from tools.plots import make_figures
from tools.validate import validate_file

ROOT = Path(__file__).resolve().parent.parent


@pytest.mark.parametrize("condition", list(CONDITIONS))
def test_configs_are_valid_and_recognised(condition):
    for seed in SEEDS:
        cfg = make_config(condition, seed)
        assert condition_of(cfg) == condition
        assert cfg["total_steps"] == 1_000_000 and cfg["seed"] == seed


def test_committed_configs_match_the_generator():
    for condition in CONDITIONS:
        for seed in SEEDS:
            path = ROOT / "configs" / f"{condition}_s{seed}.yaml"
            assert validate_file(path) == "config"
            assert yaml.safe_load(path.read_text(encoding="utf-8")) == make_config(condition, seed)


def test_trial_runs_belong_to_no_condition():
    cfg = yaml.safe_load((ROOT / "configs" / "ppo_demo.yaml").read_text(encoding="utf-8"))
    assert condition_of(cfg) is None


def untrained_run(runs_dir: Path, run_id: str, condition: str, seed: int) -> Path:
    """Run directory with the config of a condition and an UNTRAINED SB3 checkpoint."""
    import stable_baselines3 as sb3

    cfg = make_config(condition, seed)
    cfg["env"]["max_steps"] = 30  # épisodes très courts : on teste la chaîne, pas l'agent
    run_dir = runs_dir / run_id
    (run_dir / "checkpoints").mkdir(parents=True)
    (run_dir / "config.yaml").write_text(yaml.safe_dump(cfg), encoding="utf-8")
    env = F1Env(cfg, load_tracks(["gen_00"]))
    getattr(sb3, cfg["algo"].upper())("MlpPolicy", env, seed=seed, device="cpu").save(run_dir / "checkpoints" / "step_10")
    return run_dir


def test_evaluate_all_and_figures(tmp_path):
    runs = tmp_path / "runs"
    untrained_run(runs, "ppo_multi_mufixe_s0_20260101-0000", "ppo_mufixe", 0)
    untrained_run(runs, "ppo_multi_mufixe_s0_20260102-0000", "ppo_mufixe", 0)  # plus récent : seul retenu
    untrained_run(runs, "ppo_multi_mufixe_s1_20260101-0000", "ppo_mufixe", 1)
    untrained_run(runs, "dqn_multi_mufixe_s0_20260101-0000", "dqn_mufixe", 0)
    (runs / "_bench").mkdir()

    found = find_runs(runs)
    assert [(c, s, d.name) for c, s, d in found] == [
        ("dqn_mufixe", 0, "dqn_multi_mufixe_s0_20260101-0000"),
        ("ppo_mufixe", 0, "ppo_multi_mufixe_s0_20260102-0000"),
        ("ppo_mufixe", 1, "ppo_multi_mufixe_s1_20260101-0000"),
    ]

    out = tmp_path / "results" / "eval.csv"
    n = evaluate_all(runs, out, mu_factors=(1.0, 0.6), train_tracks=["gen_00"], test_tracks=["gen_10"])
    assert n == 4 * 2 * 2  # (classique + 3 runs) × 2 circuits × 2 μ
    assert validate_file(out) == "eval"
    replays = sorted(runs.glob("*/replays/*.json"))
    assert len(replays) == 4 * 2  # replays de démo : premier circuit de test, à chaque μ
    assert all(validate_file(p) == "replay" for p in replays)
    assert (runs / "classic_ref" / "replays").is_dir()

    # Données de test pour les courbes d'apprentissage (écrites à la main, dans tmp_path)
    for _, seed, run_dir in found:
        with open(run_dir / "progress.csv", "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=PROGRESS_COLUMNS)
            writer.writeheader()
            for step in (10, 20, 30):
                writer.writerow({"run_id": run_dir.name, "algo": "ppo", "seed": seed, "mu_mode": "fixed",
                                 "step": step, "wall_time_s": step, "mean_reward": step + seed,
                                 "std_reward": 0, "lap_rate": 0.0, "mean_lap_time": "", "offtracks_per_ep": 1})
    figures = make_figures(runs, out, tmp_path / "figures")
    names = {p.name for p in figures}
    assert {"learning_reward.png", "learning_laps.png", "laps_test_mu1.png", "robustness_mu.png",
            "train_vs_test.png"} <= names
    assert all(p.stat().st_size > 10_000 for p in figures)


def test_no_figure_without_real_data(tmp_path):
    assert make_figures(tmp_path / "runs", tmp_path / "eval.csv", tmp_path / "figures") == []
    assert not (tmp_path / "figures").exists()
