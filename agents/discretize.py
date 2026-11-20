"""Map the current racing environment to a compact tabular state."""

from collections.abc import Sequence
from math import prod

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from env.f1_env import F1Env, wrap_angle
from sim.sensors import read_sensors

SENSOR_ANGLES = np.radians([-45, 0, 45])  # Rayons relatifs au cap de la voiture.
DISTANCE_THRESHOLDS = (8.0, 20.0, 45.0)  # Distance en mètres, du bord proche à la voie dégagée.
SPEED_THRESHOLDS = (8.0, 18.0, 30.0)  # Vitesse en m/s, de l'allure lente à la vitesse élevée.
HEADING_THRESHOLDS = (-0.1, 0.1)  # Écart cap-piste en radians, avec une tranche centrale autour de zéro.

STATE_SHAPE = (len(DISTANCE_THRESHOLDS) + 1,) * len(SENSOR_ANGLES) + (
    len(SPEED_THRESHOLDS) + 1,
    len(HEADING_THRESHOLDS) + 1,
)
N_STATES = prod(STATE_SHAPE)


def encode(bins: Sequence[int]) -> int:
    """Flatten bins ordered by the three sensor angles, speed, and heading error."""
    return int(np.ravel_multi_index(bins, STATE_SHAPE))


def decode(state: int) -> tuple[int, ...]:
    """Recover the five bin indices from a tabular state."""
    return tuple(map(int, np.unravel_index(state, STATE_SHAPE)))


def discrete_state(env: gym.Env) -> int:
    """Read the current F1Env state after a reset or step, including through wrappers."""
    base_env = env.unwrapped
    car, pos, track = base_env.car, base_env.pos, base_env.track
    distances = read_sensors(track, car.x, car.y, car.psi, index=pos.index, angles=SENSOR_ANGLES)
    distance_bins = np.digitize(distances, DISTANCE_THRESHOLDS)
    speed_bin = np.digitize(car.v, SPEED_THRESHOLDS)
    heading_bin = np.digitize(wrap_angle(car.psi - pos.heading), HEADING_THRESHOLDS)
    return encode((*distance_bins, speed_bin, heading_bin))


class DiscreteStateWrapper(gym.Wrapper):
    """Expose a tabular observation for a racing environment with discrete9 actions."""

    def __init__(self, env: F1Env):
        super().__init__(env)
        if env.unwrapped.action_mode != "discrete9":
            raise ValueError("DiscreteStateWrapper requires an F1Env with discrete9 actions")
        self.observation_space = spaces.Discrete(N_STATES)

    def reset(self, *, seed: int | None = None, options: dict | None = None):
        """Reset the race and return its discrete observation and original info."""
        _, info = self.env.reset(seed=seed, options=options)
        return discrete_state(self.env), info

    def step(self, action):
        """Apply an action and replace only the observation in the result."""
        _, reward, terminated, truncated, info = self.env.step(action)
        return discrete_state(self.env), reward, terminated, truncated, info
