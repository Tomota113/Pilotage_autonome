"""Tabular Q-learning scaffold and training loop."""

from pathlib import Path

import gymnasium as gym
import numpy as np


class QLearningAgent:
    """Store one Q-value per discrete state and action."""

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
        # En mode greedy, prendre directement l'indice de la plus grande valeur de Q[state].
        # Sinon, tirer avec self.rng : avec probabilité epsilon(step), explorer en choisissant
        # une action uniforme. Dans les autres cas, prendre la meilleure action de Q[state].
        raise NotImplementedError("À écrire par l'étudiant : choisir une action epsilon-greedy")

    def update(self, state: int, action: int, reward: float, next_state: int, terminated: bool) -> None:
        """Adjust the Q-value for a single transition toward its Bellman target."""
        # Partir de la récompense pour la cible de Bellman. Si l'état suivant est non terminal,
        # ajouter gamma fois la meilleure valeur de Q[next_state].
        # Une troncature arrête la collecte, mais l'état suivant garde une valeur future :
        # la boucle passe donc seulement terminated pour décider du bootstrap.
        # Corriger Q[state, action] de alpha fois l'écart entre la cible et sa valeur actuelle.
        raise NotImplementedError("À écrire par l'étudiant : mettre à jour la valeur Q")

    def save(self, path: str | Path) -> None:
        """Save the Q-table to a .npy file."""
        np.save(path, self.q, allow_pickle=False)

    def load(self, path: str | Path) -> None:
        """Restore a Q-table with the same state and action dimensions from a .npy file."""
        table = np.load(path, allow_pickle=False)
        if table.shape != self.q.shape:
            raise ValueError(f"Expected Q-table shape {self.q.shape}, got {table.shape}")
        self.q[:] = table


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
    from agents.train import ProgressLog, evaluate_episodes

    log = ProgressLog(Path(progress_path), meta)
    state, _ = env.reset(seed=meta["seed"])
    for step in range(1, total_steps + 1):
        action = agent.act(state, step - 1)
        next_state, reward, terminated, truncated, _ = env.step(action)
        agent.update(state, action, reward, next_state, terminated)
        state = next_state
        if (terminated or truncated) and step < total_steps:
            state, _ = env.reset()

        if step % eval_every == 0 or step == total_steps:
            metrics = evaluate_episodes(eval_env, lambda obs: agent.act(obs, step, greedy=True), eval_episodes)
            log.write(step, metrics)

    return agent
