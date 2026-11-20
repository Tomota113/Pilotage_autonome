"""Shared parts of the tabular agents (Q-Learning, SARSA, Monte-Carlo).

Les trois méthodes tabulaires partagent la même table Q (une ligne par état
discret de agents/discretize.py, une colonne par action discrete9), la même
politique epsilon-greedy, la même sauvegarde .npy et la même évaluation
périodique. Seule la règle de mise à jour de Q change d'un algorithme à
l'autre (voir qlearning.py, sarsa.py, monte_carlo.py).
"""

from pathlib import Path

import gymnasium as gym
import numpy as np


class TabularAgent:
    """One Q-value per discrete state and action, epsilon-greedy policy."""

    def __init__(
        self,
        n_states: int,
        n_actions: int,
        alpha: float = 0.1,
        gamma: float = 0.99,
        epsilon_start: float = 1.0,
        epsilon_end: float = 0.05,
        epsilon_decay_steps: int = 200_000,
        seed: int = 0,
    ):
        if epsilon_decay_steps < 0:
            raise ValueError("epsilon_decay_steps must be non-negative")
        self.n_actions = n_actions
        self.alpha = alpha
        self.gamma = gamma
        self.epsilon_start = epsilon_start
        self.epsilon_end = epsilon_end
        self.epsilon_decay_steps = epsilon_decay_steps
        self.q = np.zeros((n_states, n_actions))
        self.rng = np.random.default_rng(seed)

    def epsilon(self, step: int) -> float:
        """Interpolate linearly between the initial and final exploration rates."""
        if self.epsilon_decay_steps == 0:
            return self.epsilon_end
        fraction = min(max(step, 0), self.epsilon_decay_steps) / self.epsilon_decay_steps
        return (1.0 - fraction) * self.epsilon_start + fraction * self.epsilon_end

    def act(self, state: int, step: int, greedy: bool = False) -> int:
        """Choose an action with epsilon-greedy exploration, or exploit in greedy mode."""
        q_values = self.q[state]
        if greedy:
            # Évaluation : toujours la meilleure action (argmax), pour un résultat reproductible
            return int(np.argmax(q_values))
        if self.rng.random() < self.epsilon(step):
            # Exploration : action tirée uniformément, avec probabilité epsilon
            return int(self.rng.integers(self.n_actions))
        # Exploitation : meilleure action ; les égalités (table encore à zéro au début) sont
        # départagées au hasard, sinon l'agent choisirait toujours l'action 0
        best = np.flatnonzero(q_values == q_values.max())
        return int(self.rng.choice(best))

    def save(self, path: str | Path) -> None:
        """Save the Q-table to a .npy file."""
        np.save(path, self.q, allow_pickle=False)

    def load(self, path: str | Path) -> None:
        """Restore a Q-table with the same state and action dimensions from a .npy file."""
        table = np.load(path, allow_pickle=False)
        if table.shape != self.q.shape:
            raise ValueError(f"Expected Q-table shape {self.q.shape}, got {table.shape}")
        self.q[:] = table


class Evaluator:
    """Greedy evaluation every ``eval_every`` steps (and at the last step), logged to progress.csv."""

    def __init__(self, agent: TabularAgent, eval_env: gym.Env, total_steps: int, eval_every: int,
                 eval_episodes: int, progress_path: str | Path, meta: dict):
        from agents.train import ProgressLog  # import local : agents.train importe ce module dans une fonction

        self.agent, self.eval_env = agent, eval_env
        self.total_steps, self.eval_every, self.eval_episodes = total_steps, eval_every, eval_episodes
        self.log = ProgressLog(Path(progress_path), meta)

    def after_step(self, step: int) -> None:
        from agents.train import evaluate_episodes

        if step % self.eval_every == 0 or step == self.total_steps:
            metrics = evaluate_episodes(self.eval_env, lambda obs: self.agent.act(obs, step, greedy=True),
                                        self.eval_episodes)
            self.log.write(step, metrics)
