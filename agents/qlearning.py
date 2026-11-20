"""Tabular Q-learning agent and training loop."""

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

    def update(self, state: int, action: int, reward: float, next_state: int, terminated: bool) -> None:
        """Adjust the Q-value for a single transition toward its Bellman target."""
        # Cible de Bellman : r + gamma * max_a' Q(s', a'). Si l'épisode est terminé (sortie de
        # piste ou tour validé), il n'y a pas d'avenir : la cible vaut r. Une troncature
        # (temps limite) n'est pas une vraie fin : l'état suivant garde sa valeur future, d'où
        # le seul paramètre terminated.
        target = reward if terminated else reward + self.gamma * float(np.max(self.q[next_state]))
        # Q(s, a) <- Q(s, a) + alpha * (cible - Q(s, a)) : on corrige d'une fraction alpha de l'erreur
        self.q[state, action] += self.alpha * (target - self.q[state, action])

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
