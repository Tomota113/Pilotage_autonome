"""Tests du pilote classique (agents/classic_driver.py) et de l'évaluation (agents/evaluate.py).

Les tests SB3 utilisent des modèles NON entraînés : ils ne vérifient que le
format des fichiers produits, jamais une performance.
"""

import json

import pytest
import yaml

from agents.classic_driver import ClassicDriver
from agents.evaluate import evaluate
from env.f1_env import F1Env, load_tracks
from tests.test_validate import valid_config
from tools.validate import validate_file, validate_replay


@pytest.mark.parametrize("mu", [1.0, 0.6])
def test_classic_driver_laps_demo_oval(mu):
    env = F1Env(None, load_tracks(["demo_oval"]))
    env.reset(seed=0, options={"mu_factor": mu})
    driver = ClassicDriver()
    while True:
        _, _, terminated, truncated, info = env.step(driver.act(env))
        if terminated or truncated:
            break
    assert info["lap_time"] is not None and not info["off_track"]


def test_classic_target_speed_follows_grip():
    env = F1Env(None, load_tracks(["demo_oval"]))
    env.reset(seed=0)
    driver = ClassicDriver()
    # Dans le virage de rayon 60 m : 0,9 sqrt(mu g R)
    env.pos = env.track.project(150.0 + 60.0, 0.0)
    for mu in (1.0, 0.6):
        assert driver.target_speed(env, mu) == pytest.approx(0.9 * (mu * 9.81 * 60.0) ** 0.5, rel=0.03)
    # 50 m après la sortie du virage : 150 m de ligne droite devant, vitesse de pointe
    env.pos = env.track.project(-100.0, -60.0)
    assert driver.target_speed(env, 1.0) == pytest.approx(driver.v_top)
    # 50 m avant le virage : vitesse d'où l'on peut encore freiner jusqu'à la vitesse du virage,
    # sqrt(v_virage² + 2 mu g d). La courbure lissée monte progressivement de s = 285 à 320 m
    # (pleine valeur 20 m après l'entrée du virage) : d est donc compris entre 40 et 70 m.
    env.pos = env.track.project(100.0, -60.0)
    v_bend = 0.9 * (9.81 * 60.0) ** 0.5
    v = driver.target_speed(env, 1.0)
    assert (v_bend**2 + 2 * 9.81 * 40.0) ** 0.5 <= v <= (v_bend**2 + 2 * 9.81 * 70.0) ** 0.5


def test_evaluate_classic_writes_valid_replay_and_eval_csv(tmp_path):
    csv_path = tmp_path / "results" / "eval.csv"
    rows = evaluate("classic", ["demo_oval"], [1.0, 0.6], episodes=1, run_id="classic_test",
                    eval_csv=csv_path, runs_dir=tmp_path / "runs")
    assert [r["outcome"] for r in rows] == ["lap", "lap"]
    assert validate_file(csv_path) == "eval"
    for r in rows:
        path = tmp_path / r["replay_path"]
        assert validate_file(path) == "replay"
        replay = json.loads(path.read_text(encoding="utf-8"))
        assert replay["agent"]["algo"] == "classic" and "network" not in replay
        assert "activations" not in replay["frames"][0]
        assert replay["summary"]["lap_time"] == pytest.approx(r["lap_time"])
    # Les lignes s'ajoutent au fichier existant
    evaluate("classic", ["demo_oval"], [1.0], run_id="classic_test", eval_csv=csv_path,
             runs_dir=tmp_path / "runs", save_replays=False)
    assert len(csv_path.read_text(encoding="utf-8").splitlines()) == 1 + 3


@pytest.mark.parametrize("algo, action_space, out_dim", [("ppo", "continuous", 3), ("dqn", "discrete9", 9)])
def test_evaluate_sb3_checkpoint_with_activations(tmp_path, algo, action_space, out_dim):
    import stable_baselines3 as sb3

    cfg = valid_config()
    cfg["algo"] = algo
    cfg["env"].update(action_space=action_space, max_steps=40)
    run_dir = tmp_path / "runs" / f"{algo}_test"
    (run_dir / "checkpoints").mkdir(parents=True)
    (run_dir / "config.yaml").write_text(yaml.safe_dump(cfg), encoding="utf-8")
    env = F1Env(cfg, load_tracks(["demo_oval"]))
    model = getattr(sb3, algo.upper())("MlpPolicy", env, seed=0, device="cpu")  # NON entraîné
    ckpt = run_dir / "checkpoints" / "step_0.zip"
    model.save(ckpt)

    rows = evaluate(str(ckpt), ["demo_oval"], [0.8], with_activations=True,
                    eval_csv=tmp_path / "eval.csv", runs_dir=tmp_path / "runs")
    replay = json.loads((tmp_path / rows[0]["replay_path"]).read_text(encoding="utf-8"))
    validate_replay(replay)
    assert replay["run_id"] == f"{algo}_test" and replay["agent"]["algo"] == algo
    assert replay["network"]["layers"] == [12, 64, 64, out_dim]
    acts = replay["frames"][0]["activations"]
    assert [len(layer) for layer in acts] == [64, 64]
    assert rows[0]["mu_mode"] == "fixed" and rows[0]["split"] == "demo"
