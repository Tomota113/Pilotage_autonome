"""Tabular Q-learning agent and training loop (off-policy temporal difference)."""

from pathlib import Path

import gymnasium as gym
import numpy as np

from agents.tabular import Evaluator, TabularAgent


class QLearningAgent(TabularAgent):
    """Q-learning: bootstrap on the best next action, whatever the policy actually does next."""

    def update(self, state: int, action: int, reward: float, next_state: int, terminated: bool) -> None:
        """Adjust the Q-value for a single transition toward its Bellman target."""
        # Cible de Bellman : r + gamma * max_a' Q(s', a'). Si l'épisode est terminé (sortie de
        # piste ou tour validé), il n'y a pas d'avenir : la cible vaut r. Une troncature
        # (temps limite) n'est pas une vraie fin : l'état suivant garde sa valeur future, d'où
        # le seul paramètre terminated.
        target = reward if terminated else reward + self.gamma * float(np.max(self.q[next_state]))
        # Q(s, a) <- Q(s, a) + alpha * (cible - Q(s, a)) : on corrige d'une fraction alpha de l'erreur
        self.q[state, action] += self.alpha * (target - self.q[state, action])


def train(
    agent: QLearningAgent,
    env: gym.Env,
    eval_env: gym.Env,
    total_steps: int,
    eval_every: int,
    eval_episodes: int,
    progress_path: str | Path,
    meta: dict,
) -> QLearningAgent:
    """Train for the given step budget and log greedy evaluation on a separate environment.

    The evaluation environment must report ``off_track`` and ``lap_time`` in its info.
    The run metadata supplies ``run_id``, ``algo``, ``seed``, and ``mu_mode``.
    """
    evaluator = Evaluator(agent, eval_env, total_steps, eval_every, eval_episodes, progress_path, meta)
    state, _ = env.reset(seed=meta["seed"])
    for step in range(1, total_steps + 1):
        action = agent.act(state, step - 1)
        next_state, reward, terminated, truncated, _ = env.step(action)
        agent.update(state, action, reward, next_state, terminated)
        state = next_state
        if (terminated or truncated) and step < total_steps:
            state, _ = env.reset()
        evaluator.after_step(step)
    return agent
