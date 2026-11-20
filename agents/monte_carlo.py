"""Tabular Monte-Carlo control (first-visit, constant step size) and training loop.

Au lieu d'estimer la valeur future avec Q (bootstrap) comme le Q-Learning et
SARSA, Monte-Carlo attend la fin de l'épisode et utilise le retour réellement
obtenu G_t = r_t + gamma r_{t+1} + gamma² r_{t+2} + ... Pour chaque couple
(état, action) rencontré, à sa PREMIÈRE visite dans l'épisode, on corrige
Q(s, a) <- Q(s, a) + alpha (G_t - Q(s, a)). Pas de biais de bootstrap, mais
une variance plus forte et un apprentissage seulement à la fin des épisodes.

Limite à connaître : un épisode tronqué (3000 pas, ou 100 pas sans progrès)
n'a pas de vraie fin ; son retour s'arrête à la troncature. Avec gamma = 0,99,
seuls les ~100 derniers pas sont vraiment touchés.
"""

from pathlib import Path

import gymnasium as gym
import numpy as np

from agents.tabular import Evaluator, TabularAgent


class MonteCarloAgent(TabularAgent):
    """First-visit Monte-Carlo control with a constant step size alpha."""

    def update_episode(self, states, actions, rewards) -> None:
        """Update Q from one finished episode given as parallel lists of states, actions and rewards."""
        states = np.asarray(states, dtype=int)
        actions = np.asarray(actions, dtype=int)
        returns = np.empty(len(rewards))
        g = 0.0
        for t in range(len(rewards) - 1, -1, -1):  # G_t = r_t + gamma G_{t+1}, calculé à rebours
            g = rewards[t] + self.gamma * g
            returns[t] = g
        # Première visite de chaque couple (s, a) : indice de sa première apparition
        _, first = np.unique(states * self.n_actions + actions, return_index=True)
        s, a = states[first], actions[first]
        self.q[s, a] += self.alpha * (returns[first] - self.q[s, a])  # couples distincts : pas de doublon


def train(
    agent: MonteCarloAgent,
    env: gym.Env,
    eval_env: gym.Env,
    total_steps: int,
    eval_every: int,
    eval_episodes: int,
    progress_path: str | Path,
    meta: dict,
) -> MonteCarloAgent:
    """Train for the given step budget, with greedy evaluations logged to progress.csv.

    Q changes only at the end of each episode; an episode still running when the
    budget is spent is not used (its return is unknown).
    """
    evaluator = Evaluator(agent, eval_env, total_steps, eval_every, eval_episodes, progress_path, meta)
    state, _ = env.reset(seed=meta["seed"])
    states, actions, rewards = [], [], []
    for step in range(1, total_steps + 1):
        action = agent.act(state, step - 1)
        next_state, reward, terminated, truncated, _ = env.step(action)
        states.append(state)
        actions.append(action)
        rewards.append(reward)
        state = next_state
        if terminated or truncated:
            agent.update_episode(states, actions, rewards)
            states, actions, rewards = [], [], []
            if step < total_steps:
                state, _ = env.reset()
        evaluator.after_step(step)
    return agent
