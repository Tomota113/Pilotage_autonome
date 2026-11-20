"""Tests de SARSA et de Monte-Carlo (agents/sarsa.py, agents/monte_carlo.py)."""

import csv
import json

import numpy as np
import pytest
import yaml

from agents import monte_carlo, sarsa
from agents.evaluate import evaluate
from agents.train import PROGRESS_COLUMNS, main
from tests.corridor_env import CorridorEnv
from tests.test_validate import valid_config
from tools.validate import validate_replay

META = {"run_id": "tabular_corridor_test", "algo": "sarsa", "seed": 0, "mu_mode": "fixed"}


@pytest.mark.parametrize(("terminated", "expected"), [(False, 2.25), (True, 1.75)])
def test_sarsa_update_uses_the_next_action_actually_chosen(terminated, expected):
    agent = sarsa.SarsaAgent(2, 2, alpha=0.25, gamma=0.5)
    agent.q[:] = [[2.0, 0.0], [4.0, 6.0]]
    # a' = 0 (et non la meilleure action 1) : cible 1 + 0,5 × Q(1, 0) = 3 -> 2 + 0,25 × (3 − 2) = 2,25 ;
    # terminale : cible 1 -> 2 + 0,25 × (1 − 2) = 1,75 (le Q-Learning aurait visé 1 + 0,5 × 6 = 4)
    agent.update(state=0, action=0, reward=1.0, next_state=1, next_action=0, terminated=terminated)
    np.testing.assert_allclose(agent.q, [[expected, 0.0], [4.0, 6.0]])


def test_monte_carlo_first_visit_returns():
    agent = monte_carlo.MonteCarloAgent(3, 2, alpha=0.5, gamma=0.5)
    # Épisode : (s0,a1,r=0) (s1,a0,r=0) (s0,a1,r=0) (s2,a0,r=4)
    # Retours : G3 = 4, G2 = 2, G1 = 1, G0 = 0,5 ; première visite de (0,1) au pas 0 -> G = 0,5
    agent.update_episode([0, 1, 0, 2], [1, 0, 1, 0], [0.0, 0.0, 0.0, 4.0])
    expected = np.zeros((3, 2))
    expected[0, 1] = 0.5 * 0.5
    expected[1, 0] = 0.5 * 1.0
    expected[2, 0] = 0.5 * 4.0
    np.testing.assert_allclose(agent.q, expected)


@pytest.mark.parametrize("module, cls", [(sarsa, sarsa.SarsaAgent), (monte_carlo, monte_carlo.MonteCarloAgent)])
def test_corridor_learns_to_move_right(tmp_path, module, cls):
    env = CorridorEnv(length=6)
    agent = cls(6, 2, alpha=0.3, gamma=0.95, epsilon_decay_steps=2000, seed=0)
    module.train(agent, env, CorridorEnv(length=6), 6000, 3000, 1, tmp_path / "progress.csv", META)
    assert [agent.act(s, 6000, greedy=True) for s in range(5)] == [1] * 5
    with open(tmp_path / "progress.csv", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    assert tuple(reader.fieldnames) == PROGRESS_COLUMNS and [int(r["step"]) for r in rows] == [3000, 6000]


@pytest.mark.parametrize("algo", ["sarsa", "montecarlo"])
def test_train_and_evaluate_on_the_car(tmp_path, algo):
    cfg = valid_config()
    cfg.update(algo=algo, eval_every=200, eval_episodes=1)
    cfg["tracks"]["train"] = ["demo_oval"]
    cfg["env"].update(action_space="discrete9", max_steps=150)
    path = tmp_path / "cfg.yaml"
    path.write_text(yaml.safe_dump(cfg), encoding="utf-8")
    run_dir = main([str(path), "--steps", "400", "--runs-dir", str(tmp_path / "runs")])
    ckpt = run_dir / "checkpoints" / "step_400.npy"
    assert np.load(ckpt).shape == (768, 9)

    rows = evaluate(str(ckpt), ["demo_oval"], [1.0], eval_csv=tmp_path / "eval.csv", runs_dir=tmp_path / "runs")
    replay = json.loads((tmp_path / rows[0]["replay_path"]).read_text(encoding="utf-8"))
    validate_replay(replay)
    assert rows[0]["algo"] == algo and replay["agent"]["algo"] == algo
    assert replay["schema"] == "f1rl.replay/1.1"
