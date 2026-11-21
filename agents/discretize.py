"""Map the current racing environment to a compact tabular state.

Deux découpages, selon la voiture de l'environnement (``env.car_model``) :
- v1 (768 états) : 3 distances aux bords à −45°, 0°, +45° en 4 tranches, vitesse en 4 tranches,
  écart cap-piste en 3 tranches. Inchangé, pour que les résultats de la série v1 restent reproductibles.
- f1_2024 (5 760 états) : découpage adapté à une F1. Les distances portent jusqu'à 200 m, la vitesse
  va jusqu'à 345 km/h (6 tranches), et on ajoute la courbure du virage à 150 m (5 tranches : fort à
  gauche, gauche, droit, droite, fort à droite). Sans cette information, l'agent ne peut pas savoir
  qu'il faut freiner avant un virage qu'il ne voit pas encore avec ses capteurs.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from math import prod

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from env.f1_env import CURVATURE_SCALE, F1Env, wrap_angle
from sim.sensors import read_sensors

SENSOR_ANGLES = np.radians([-45, 0, 45])  # Rayons relatifs au cap de la voiture.


@dataclass(frozen=True)
class Scheme:
    """Thresholds of one discretisation (np.digitize bins)."""

    distances: tuple  # distances aux bords (m)
    speeds: tuple  # vitesse (m/s)
    heading: tuple  # écart cap-piste (rad)
    curvature: tuple = ()  # courbure à curvature_ahead m, × CURVATURE_SCALE ; () = non utilisée
    curvature_ahead: float = 150.0

    @property
    def shape(self) -> tuple:
        shape = (len(self.distances) + 1,) * len(SENSOR_ANGLES) + (len(self.speeds) + 1, len(self.heading) + 1)
        return shape + ((len(self.curvature) + 1,) if self.curvature else ())

    @property
    def n_states(self) -> int:
        return prod(self.shape)


SCHEMES = {
    "v1": Scheme(distances=(8.0, 20.0, 45.0), speeds=(8.0, 18.0, 30.0), heading=(-0.1, 0.1)),
    "f1_2024": Scheme(
        distances=(12.0, 35.0, 90.0),
        speeds=tuple(kmh / 3.6 for kmh in (80, 130, 180, 230, 280)),
        heading=(-0.1, 0.1),
        curvature=(-0.4, -0.1, 0.1, 0.4),  # courbure × 10 : R < 25 m, R < 100 m, droit, ...
    ),
}

# Compatibilité : constantes du découpage v1
DISTANCE_THRESHOLDS = SCHEMES["v1"].distances
SPEED_THRESHOLDS = SCHEMES["v1"].speeds
HEADING_THRESHOLDS = SCHEMES["v1"].heading
STATE_SHAPE = SCHEMES["v1"].shape
N_STATES = SCHEMES["v1"].n_states


def scheme_of(env: gym.Env) -> Scheme:
    return SCHEMES[getattr(env.unwrapped, "car_model", "v1")]


def encode(bins: Sequence[int], shape: tuple = STATE_SHAPE) -> int:
    """Flatten bins ordered by the three sensor angles, speed, heading error (and curvature)."""
    return int(np.ravel_multi_index(bins, shape))


def decode(state: int, shape: tuple = STATE_SHAPE) -> tuple[int, ...]:
    """Recover the bin indices from a tabular state."""
    return tuple(map(int, np.unravel_index(state, shape)))


def discrete_state(env: gym.Env) -> int:
    """Read the current F1Env state after a reset or step, including through wrappers."""
    base_env = env.unwrapped
    scheme = scheme_of(env)
    car, pos, track = base_env.car, base_env.pos, base_env.track
    distances = read_sensors(track, car.x, car.y, car.psi, index=pos.index, angles=SENSOR_ANGLES,
                             max_range=getattr(base_env, "sensor_range", 100.0))
    bins = [*np.digitize(distances, scheme.distances), np.digitize(car.v, scheme.speeds),
            np.digitize(wrap_angle(car.psi - pos.heading), scheme.heading)]
    if scheme.curvature:
        kappa = track.curvature_ahead(pos.s, scheme.curvature_ahead) * CURVATURE_SCALE
        bins.append(np.digitize(kappa, scheme.curvature))
    return encode(bins, scheme.shape)


class DiscreteStateWrapper(gym.Wrapper):
    """Expose a tabular observation for a racing environment with discrete9 actions."""

    def __init__(self, env: F1Env):
        super().__init__(env)
        if env.unwrapped.action_mode != "discrete9":
            raise ValueError("DiscreteStateWrapper requires an F1Env with discrete9 actions")
        self.observation_space = spaces.Discrete(scheme_of(env).n_states)

    def reset(self, *, seed: int | None = None, options: dict | None = None):
        """Reset the race and return its discrete observation and original info."""
        _, info = self.env.reset(seed=seed, options=options)
        return discrete_state(self.env), info

    def step(self, action):
        """Apply an action and replace only the observation in the result."""
        _, reward, terminated, truncated, info = self.env.step(action)
        return discrete_state(self.env), reward, terminated, truncated, info
