"""Cibles de mise à jour, apprentissage sur le couloir et intégration avec F1Env."""

import csv
import json
from unittest.mock import patch

import gymnasium as gym
import numpy as np
import pytest
import torch
import yaml

from agents.deep_value import DeepMonteCarloAgent, DeepSarsaAgent, train
from agents.evaluate import evaluate
from agents.train import PROGRESS_COLUMNS, main
from tests.corridor_env import CorridorEnv
from tests.test_validate import valid_config
from tools.evaluate_all import best_checkpoint, last_checkpoint
from tools.validate import validate_replay


class OneHotCorridor(gym.ObservationWrapper):
    def __init__(self):
        super().__init__(CorridorEnv())
        self.states = np.eye(self.env.length, dtype=np.float32)
        self.observation_space = gym.spaces.Box(0.0, 1.0, shape=(self.env.length,), dtype=np.float32)

    def observation(self, obs):
        return self.states[obs]


@pytest.mark.parametrize("terminated, expected_target, expected_loss", [(False, -1.5, 1.0), (True, 0.5, 0.125)])
def test_sarsa_uses_next_action_and_huber_loss(terminated, expected_target, expected_loss):
    agent = DeepSarsaAgent(2, 2, net_arch=[2], gamma=0.5, batch_size=1, learning_starts=0)
    obs, next_obs = np.eye(2, dtype=np.float32)
    with torch.no_grad():
        for parameter in agent.network.parameters():
            parameter.zero_()
        hidden, _, output = agent.target_network.layers
        hidden.weight.copy_(torch.eye(2))
        hidden.bias.zero_()
        output.weight.copy_(torch.tensor([[0.0, 6.0], [0.0, -4.0]]))
        output.bias.zero_()

    # a' = 1 a une valeur de -4. Prendre le max (6) ferait monter Q au lieu de le baisser.
    with patch("agents.deep_value.F.smooth_l1_loss", wraps=torch.nn.functional.smooth_l1_loss) as huber:
        agent.update(obs, 0, 0.5, next_obs, None if terminated else 1, terminated)
    huber.assert_called_once()
    prediction, target = huber.call_args.args
    assert prediction.item() == 0.0
    assert target.item() == expected_target
    assert torch.nn.functional.smooth_l1_loss(prediction, target).item() == expected_loss
    updated = agent.network(torch.from_numpy(obs)).detach()
    assert updated[0] * expected_target > 0 and updated[1] == 0


def test_monte_carlo_regresses_on_discounted_returns():
    agent = DeepMonteCarloAgent(3, 2, net_arch=[4], gamma=0.5, batch_size=2, epochs=2)
    observations = np.eye(3, dtype=np.float32)
    with patch.object(agent, "_fit", wraps=agent._fit) as fit:
        agent.update_episode(observations, [0, 1, 0], [1.0, 4.0, 2.0])

    assert [len(call.args[0]) for call in fit.call_args_list] == [2, 1, 2, 1]
    for epoch in range(2):
        samples = {}
        for call in fit.call_args_list[2 * epoch:2 * epoch + 2]:
            states, actions, targets = call.args
            samples.update(zip(states.argmax(dim=1).tolist(), zip(actions.tolist(), targets.tolist())))
        # 2 à la fin, puis 4 + 0,5 × 2, puis 1 + 0,5 × 5.
        assert samples == {0: (0, 3.5), 1: (1, 5.0), 2: (0, 2.0)}


def test_sarsa_carries_next_action_and_bootstraps_at_truncation(tmp_path):
    env = gym.wrappers.TimeLimit(OneHotCorridor(), max_episode_steps=2)
    agent = DeepSarsaAgent(5, 2, net_arch=[4], batch_size=1, learning_starts=10)
    # Une première action à gauche, puis a' = 1 à jouer. À la troncature,
    # a' = 0 sert à la cible et l'épisode suivant recommence avec l'action 1.
    actions = iter([0, 1, 0, 1, 1])
    with patch.object(agent, "act", side_effect=lambda obs, step, greedy=False: 1 if greedy else next(actions)):
        train(agent, env, OneHotCorridor(), 3, 3, 1, tmp_path / "progress.csv",
              {"run_id": "sarsa", "algo": agent.algo, "seed": 0, "mu_mode": "fixed"}, tmp_path / "checkpoints", 3)
    assert [(action, next_action, terminal) for _, action, _, _, next_action, terminal in agent.buffer] == [
        (0, 1, False), (1, 0, False), (1, 1, False),
    ]
    np.testing.assert_array_equal(agent.buffer[1][3], np.eye(5)[1])


@pytest.mark.parametrize("agent_cls, extra", [
    (DeepSarsaAgent, {"learning_starts": 16, "target_update": 20, "buffer_size": 128}),
    (DeepMonteCarloAgent, {"epochs": 8}),
])
def test_deep_agents_learn_to_go_right(tmp_path, agent_cls, extra):
    env = OneHotCorridor()
    agent = agent_cls(5, 2, net_arch=[16, 16], batch_size=16, learning_rate=3e-3, gamma=0.95,
                      epsilon_decay_steps=700, seed=0, **extra)
    train(agent, env, OneHotCorridor(), 1000, 1000, 1, tmp_path / "progress.csv",
          {"run_id": "corridor", "algo": agent.algo, "seed": 0, "mu_mode": "fixed"},
          tmp_path / "checkpoints", 1000)

    obs, _ = env.reset()
    for _ in range(4):
        action = agent.act(obs, 1000, greedy=True)
        assert action == 1
        obs, _, terminated, truncated, _ = env.step(action)
    assert terminated and not truncated


@pytest.mark.parametrize("algo, observe_mu, extra", [
    ("deep_sarsa", False, {"learning_starts": 16, "target_update": 50}),
    ("deep_mc", True, {}),
])
def test_short_car_training_writes_checkpoints_and_replay(tmp_path, algo, observe_mu, extra):
    cfg = valid_config()
    cfg.update(schema="f1rl.config/1.3", algo=algo, total_steps=400, checkpoint_every=150, eval_every=150,
               eval_episodes=1, hyperparams={"net_arch": [16, 8], "batch_size": 16, **extra})
    cfg["tracks"]["train"] = ["demo_oval"]
    cfg["env"].update(action_space="discrete9", max_steps=150, observe_mu=observe_mu, random_start=True)
    config = tmp_path / "config.yaml"
    config.write_text(yaml.safe_dump(cfg), encoding="utf-8")
    runs = tmp_path / "runs"
    run_dir = main([str(config), "--runs-dir", str(runs)])

    with (run_dir / "progress.csv").open(encoding="utf-8") as progress:
        reader = csv.DictReader(progress)
        rows = list(reader)
    assert tuple(reader.fieldnames) == PROGRESS_COLUMNS
    assert [int(row["step"]) for row in rows] == [150, 300, 400]
    assert all(row["algo"] == algo and row["run_id"] == run_dir.name for row in rows)
    assert {path.name for path in (run_dir / "checkpoints").iterdir()} == {"step_150.pt", "step_300.pt", "step_400.pt"}
    checkpoint = run_dir / "checkpoints" / "step_400.pt"
    saved = torch.load(checkpoint, map_location="cpu", weights_only=True)
    assert set(saved) == {"state_dict", "obs_dim", "n_actions", "net_arch", "algo"}
    assert saved["obs_dim"] == 12 + observe_mu and saved["n_actions"] == 9 and saved["algo"] == algo

    rows = evaluate(str(checkpoint), ["demo_oval"], [1.0], with_activations=True,
                    eval_csv=tmp_path / "eval.csv", runs_dir=runs)
    replay = json.loads((tmp_path / rows[0]["replay_path"]).read_text(encoding="utf-8"))
    validate_replay(replay)
    assert replay["agent"] == {"algo": algo, "checkpoint": "step_400", "train_steps": 400}
    assert replay["network"] == {"layers": [12 + observe_mu, 16, 8, 9], "activation": "relu"}
    assert all([len(layer) for layer in frame["activations"]] == [16, 8] for frame in replay["frames"])
    assert all(len(frame["q_values"]) == 9 for frame in replay["frames"])  # replay 1.4


def test_checkpoint_selection_accepts_pt_and_preserves_other_formats(tmp_path):
    checkpoints = tmp_path / "checkpoints"
    checkpoints.mkdir()
    for filename in ("step_50.npy", "step_100.pt", "step_200.zip", "step_300.pt"):
        (checkpoints / filename).touch()
    (tmp_path / "progress.csv").write_text("step,lap_rate,mean_reward\n50,0,0\n100,1,10\n200,0,20\n300,0,30\n",
                                           encoding="utf-8")
    assert best_checkpoint(tmp_path) == checkpoints / "step_100.pt"
    assert last_checkpoint(tmp_path) == checkpoints / "step_300.pt"
    (checkpoints / "step_300.pt").unlink()
    assert last_checkpoint(tmp_path) == checkpoints / "step_200.zip"
    (checkpoints / "step_200.zip").unlink()
    (checkpoints / "step_100.pt").unlink()
    assert last_checkpoint(tmp_path) == checkpoints / "step_50.npy"
