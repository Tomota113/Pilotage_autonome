"""Test the Q-learning scaffold and the student's future implementation."""

import csv

import numpy as np
import pytest

from agents.qlearning import QLearningAgent, train
from agents.train import PROGRESS_COLUMNS
from tests.corridor_env import CorridorEnv

RUN_META = {"run_id": "qlearning_corridor_test", "algo": "qlearning", "seed": 0, "mu_mode": "fixed"}


def test_epsilon_decays_linearly_and_stays_bounded():
    agent = QLearningAgent(5, 2, epsilon_start=0.8, epsilon_end=0.2, epsilon_decay_steps=100)
    steps = [-5, 0, 25, 50, 100, 150]
    assert [agent.epsilon(step) for step in steps] == pytest.approx([0.8, 0.8, 0.65, 0.5, 0.2, 0.2])


def test_save_load_round_trip(tmp_path):
    agent = QLearningAgent(2, 3)
    agent.q[:] = [[0.2, 0.0, -1.0], [2.0, 3.0, 4.0]]
    path = tmp_path / "step_10.npy"
    agent.save(path)

    assert list(tmp_path.iterdir()) == [path]
    restored = QLearningAgent(2, 3)
    restored.load(path)
    np.testing.assert_array_equal(restored.q, agent.q)


@pytest.mark.parametrize(("total_steps", "expected_steps"), [(8, [4, 8]), (9, [4, 8, 9])])
def test_train_logs_each_evaluation(tmp_path, total_steps, expected_steps):
    class RandomAgent(QLearningAgent):
        """Exercise the training loop before the student implements the policy."""

        def act(self, state, step, greedy=False):
            return int(self.rng.integers(self.n_actions))

        def update(self, state, action, reward, next_state, terminated):
            pass

    agent = RandomAgent(5, 2)
    path = tmp_path / "progress.csv"
    returned = train(agent, CorridorEnv(), CorridorEnv(), total_steps, 4, 2, path, RUN_META)
    assert returned is agent

    with path.open(encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        assert tuple(reader.fieldnames) == PROGRESS_COLUMNS
        rows = list(reader)
    assert [int(row["step"]) for row in rows] == expected_steps
    for row in rows:
        assert {key: row[key] for key in RUN_META} == {key: str(value) for key, value in RUN_META.items()}
        assert float(row["offtracks_per_ep"]) == 0.0


def test_act_greedy_chooses_argmax():
    agent = QLearningAgent(2, 3)
    agent.q[1] = [1.0, -2.0, 3.0]
    try:
        actions = [agent.act(1, step=0, greedy=True) for _ in range(10)]
    except NotImplementedError:
        pytest.skip("act()/update() pas encore écrits par l'étudiant")
    assert actions == [2] * 10


@pytest.mark.parametrize(("terminated", "expected"), [(False, 2.5), (True, 1.75)])
def test_update_toward_bellman_target(terminated, expected):
    agent = QLearningAgent(2, 2, alpha=0.25, gamma=0.5)
    agent.q[:] = [[2.0, 0.0], [4.0, 6.0]]
    # Cible non terminale : 1 + 0,5 × 6 = 4. Cible terminale : 1.
    try:
        agent.update(state=0, action=0, reward=1.0, next_state=1, terminated=terminated)
    except NotImplementedError:
        pytest.skip("act()/update() pas encore écrits par l'étudiant")
    np.testing.assert_allclose(agent.q, [[expected, 0.0], [4.0, 6.0]])


def test_corridor_learns_to_move_right(tmp_path):
    env = CorridorEnv()
    n_states = env.observation_space.n
    agent = QLearningAgent(n_states, env.action_space.n, alpha=0.3, gamma=0.95, epsilon_decay_steps=1000)
    total_steps = 1500
    try:
        train(agent, env, CorridorEnv(), total_steps, total_steps, 1, tmp_path / "progress.csv", RUN_META)
        actions = [agent.act(state, total_steps, greedy=True) for state in range(n_states - 1)]
    except NotImplementedError:
        pytest.skip("act()/update() pas encore écrits par l'étudiant")
    assert actions == [1] * (n_states - 1)
