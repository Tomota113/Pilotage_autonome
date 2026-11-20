"""A one-dimensional Gymnasium corridor for testing tabular policies."""

import gymnasium as gym
from gymnasium import spaces


class CorridorEnv(gym.Env):
    """Start at zero and reach the rightmost position using left and right actions."""

    def __init__(self, length: int = 5):
        super().__init__()
        self.length = length
        self.observation_space = spaces.Discrete(length)
        self.action_space = spaces.Discrete(2)

    def reset(self, *, seed: int | None = None, options: dict | None = None):
        """Return to the left edge and start a new episode."""
        super().reset(seed=seed)
        self.position = 0
        self.steps = 0
        return self.position, {"off_track": False, "lap_time": None}

    def step(self, action: int):
        """Move one cell when possible and reward reaching the goal."""
        if not self.action_space.contains(action):
            raise ValueError(f"Invalid corridor action: {action}")
        direction = 1 if action == 1 else -1
        self.position = min(self.length - 1, max(0, self.position + direction))
        self.steps += 1

        terminated = self.position == self.length - 1
        truncated = self.steps >= 100
        reward = 1.0 if terminated else -0.01
        return self.position, reward, terminated, truncated, {"off_track": False, "lap_time": None}
