"""Agents à réseau Q pour comparer les cibles SARSA et Monte-Carlo."""

from __future__ import annotations

from collections.abc import Sequence
from copy import deepcopy
from pathlib import Path

import gymnasium as gym
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F


class QNetwork(nn.Module):
    """Transforme l'observation brute en une valeur Q par action."""

    def __init__(self, obs_dim: int, n_actions: int = 9, net_arch: Sequence[int] = (256, 256)):
        super().__init__()
        self.obs_dim = int(obs_dim)
        self.n_actions = int(n_actions)
        self.net_arch = list(net_arch)
        layers = []
        width = self.obs_dim
        for hidden in self.net_arch:
            layers.extend((nn.Linear(width, hidden), nn.ReLU()))
            width = hidden
        self.layers = nn.Sequential(*layers, nn.Linear(width, self.n_actions))

    def forward(self, obs: torch.Tensor) -> torch.Tensor:
        return self.layers(obs)


class _DeepValueAgent:
    """Partage le réseau, l'exploration epsilon-greedy, Adam et la perte de Huber.

    Par défaut, deux couches de 256 neurones, gamma = 0,99 et un taux
    d'apprentissage de 3e-4. Epsilon passe de 1 à 0,05 en 200 000 pas.
    """

    def __init__(
        self, obs_dim: int, n_actions: int = 9, *, net_arch: Sequence[int] = (256, 256),
        gamma: float = 0.99, learning_rate: float = 3e-4, batch_size: int = 64,
        epsilon_start: float = 1.0, epsilon_end: float = 0.05, epsilon_decay_steps: int = 200_000,
        seed: int = 0,
    ):
        if epsilon_decay_steps < 0 or batch_size < 1:
            raise ValueError("epsilon_decay_steps must be non-negative and batch_size must be positive")
        self.gamma = gamma
        self.batch_size = batch_size
        self.epsilon_start = epsilon_start
        self.epsilon_end = epsilon_end
        self.epsilon_decay_steps = epsilon_decay_steps
        self.action_rng = np.random.default_rng(seed)
        self.batch_rng = np.random.default_rng(seed)
        # Un thread suffit pour ces réseaux sur CPU et laisse des cœurs aux autres runs.
        torch.set_num_threads(1)
        with torch.random.fork_rng(devices=[]):
            torch.random.default_generator.manual_seed(seed)
            self.network = QNetwork(obs_dim, n_actions, net_arch)
        self.optimizer = torch.optim.Adam(self.network.parameters(), lr=learning_rate)

    def epsilon(self, step: int) -> float:
        """Fait décroître epsilon selon le nombre de pas dans l'environnement."""
        if self.epsilon_decay_steps == 0:
            return self.epsilon_end
        fraction = min(max(step, 0), self.epsilon_decay_steps) / self.epsilon_decay_steps
        return (1.0 - fraction) * self.epsilon_start + fraction * self.epsilon_end

    @torch.no_grad()
    def act(self, obs: np.ndarray, step: int, greedy: bool = False) -> int:
        """Explore pendant l'entraînement et choisit l'argmax en évaluation."""
        if not greedy and self.action_rng.random() < self.epsilon(step):
            return int(self.action_rng.integers(self.network.n_actions))
        values = self.network(torch.as_tensor(obs, dtype=torch.float32))
        if greedy:
            return int(values.argmax().item())
        best = torch.where(values == values.max())[0].numpy()
        return int(self.action_rng.choice(best))

    def _fit(self, obs: torch.Tensor, actions: torch.Tensor, targets: torch.Tensor) -> None:
        # La perte porte uniquement sur Q(s, a), pour l'action effectivement jouée.
        predictions = self.network(obs).gather(1, actions[:, None]).squeeze(1)
        loss = F.smooth_l1_loss(predictions, targets)
        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()

    def save(self, path: Path) -> None:
        """Sauvegarde les poids et les dimensions nécessaires à l'évaluation."""
        network = self.network
        temporary = path.with_suffix(".tmp")
        try:
            torch.save({"state_dict": network.state_dict(), "obs_dim": network.obs_dim,
                        "n_actions": network.n_actions, "net_arch": network.net_arch, "algo": self.algo}, temporary)
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


class DeepSarsaAgent(_DeepValueAgent):
    """Apprend à partir de l'action suivante choisie par la politique exploratoire.

    Par défaut, une mise à jour Adam par pas sur 64 transitions, après 1 000 pas
    de collecte. Le réseau cible est recopié tous les 1 000 pas et la mémoire
    conserve les 10 000 dernières transitions pour limiter le décalage de politique.
    """

    algo = "deep_sarsa"

    def __init__(
        self, obs_dim: int, n_actions: int = 9, *, buffer_size: int = 10_000, target_update: int = 1_000,
        gradient_steps: int = 1, learning_starts: int = 1_000, **kwargs,
    ):
        super().__init__(obs_dim, n_actions, **kwargs)
        if buffer_size < self.batch_size or min(target_update, gradient_steps) < 1 or learning_starts < 0:
            raise ValueError("SARSA needs buffer_size >= batch_size, positive target_update and gradient_steps, "
                             "and non-negative learning_starts")
        self.target_network = deepcopy(self.network).eval().requires_grad_(False)
        self.buffer_size = buffer_size
        self.target_update = target_update
        self.gradient_steps = gradient_steps
        self.learning_starts = learning_starts
        self.buffer = []
        self.steps = 0

    def update(self, obs: np.ndarray, action: int, reward: float, next_obs: np.ndarray,
               next_action: int | None, terminated: bool) -> None:
        """Mémorise la transition puis régresse vers r + gamma Q_cible(s', a')."""
        # L'action 0 sert de valeur de remplissage au terminal, où Q(s', a') est annulé.
        transition = (obs.copy(), action, reward, next_obs.copy(), 0 if terminated else next_action, terminated)
        if len(self.buffer) < self.buffer_size:
            self.buffer.append(transition)
        else:
            self.buffer[self.steps % self.buffer_size] = transition
        self.steps += 1
        if self.steps >= self.learning_starts and len(self.buffer) >= self.batch_size:
            for _ in range(self.gradient_steps):
                indices = self.batch_rng.choice(len(self.buffer), self.batch_size, replace=False)
                states, actions, rewards, next_states, next_actions, terminals = zip(
                    *(self.buffer[i] for i in indices)
                )
                with torch.no_grad():
                    next_values = self.target_network(torch.as_tensor(np.stack(next_states), dtype=torch.float32))
                    next_values = next_values.gather(1, torch.as_tensor(next_actions)[:, None]).squeeze(1)
                    next_values = next_values.masked_fill(torch.as_tensor(terminals), 0.0)
                    targets = torch.as_tensor(rewards, dtype=torch.float32) + self.gamma * next_values
                self._fit(torch.as_tensor(np.stack(states), dtype=torch.float32), torch.as_tensor(actions), targets)
        if self.steps % self.target_update == 0:
            self.target_network.load_state_dict(self.network.state_dict())


class DeepMonteCarloAgent(_DeepValueAgent):
    """Régresse vers le retour observé de chaque pas de l'épisode terminé."""

    algo = "deep_mc"

    def __init__(self, obs_dim: int, n_actions: int = 9, *, epochs: int = 4, **kwargs):
        super().__init__(obs_dim, n_actions, **kwargs)
        if epochs < 1:
            raise ValueError("epochs must be positive")
        self.epochs = epochs

    def update_episode(self, states: Sequence[np.ndarray], actions: Sequence[int], rewards: Sequence[float]) -> None:
        """Calcule les retours à rebours, coupés à la troncature, puis ajuste Q.

        Par défaut, quatre passes en mini-lots mélangés sur le dernier épisode.
        Chaque transition est utilisée, même si un couple état-action réapparaît.
        """
        returns = np.empty(len(rewards), dtype=np.float32)
        value = 0.0  # À la fin, aucune estimation de Q n'est ajoutée, même si l'épisode est tronqué.
        for step in range(len(rewards) - 1, -1, -1):
            value = rewards[step] + self.gamma * value
            returns[step] = value
        obs = torch.as_tensor(np.stack(states), dtype=torch.float32)
        actions = torch.as_tensor(actions)
        targets = torch.from_numpy(returns)
        for _ in range(self.epochs):
            order = self.batch_rng.permutation(len(returns))
            for start in range(0, len(order), self.batch_size):
                batch = order[start:start + self.batch_size]
                self._fit(obs[batch], actions[batch], targets[batch])


def train(agent: DeepSarsaAgent | DeepMonteCarloAgent, env: gym.Env, eval_env: gym.Env,
          total_steps: int, eval_every: int, eval_episodes: int, progress_path: str | Path, meta: dict,
          checkpoint_dir: str | Path, checkpoint_every: int) -> DeepSarsaAgent | DeepMonteCarloAgent:
    """Entraîne l'agent et enregistre les évaluations gloutonnes et les checkpoints."""
    from agents.train import ProgressLog, _print_row, evaluate_episodes

    log = ProgressLog(Path(progress_path), meta)
    checkpoint_dir = Path(checkpoint_dir)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    obs, _ = env.reset(seed=meta["seed"])
    action = agent.act(obs, 0)
    episode = []  # Monte-Carlo ne traite que les épisodes terminés ou tronqués par l'environnement.
    for step in range(1, total_steps + 1):
        next_obs, reward, terminated, truncated, _ = env.step(action)
        done = terminated or truncated
        if isinstance(agent, DeepSarsaAgent):
            # On choisit a' avant l'optimisation et on la réutilise au pas suivant.
            # Si l'épisode est tronqué, a' sert uniquement à estimer la suite.
            next_action = None if terminated else agent.act(next_obs, step)
            agent.update(obs, action, reward, next_obs, next_action, terminated)
        else:
            episode.append((obs.copy(), action, reward))
            if done:
                states, actions, rewards = zip(*episode)
                agent.update_episode(states, actions, rewards)
                episode.clear()
            next_action = None

        if step % checkpoint_every == 0 or step == total_steps:
            agent.save(checkpoint_dir / f"step_{step}.pt")
        if step % eval_every == 0 or step == total_steps:
            metrics = evaluate_episodes(eval_env, lambda state: agent.act(state, step, greedy=True), eval_episodes)
            _print_row(log.write(step, metrics))
        if step < total_steps:
            obs = next_obs
            if done:
                obs, _ = env.reset()
                next_action = None
            action = agent.act(obs, step) if next_action is None else next_action
    return agent
