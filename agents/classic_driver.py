"""Classic (non-learning) driver: pure pursuit steering + grip-limited speed profile.

C'est la référence non-RL du projet. Contrairement aux agents, il connaît
l'adhérence mu et toute la géométrie du circuit :

- direction : poursuite de cible (pure pursuit). On vise le point de la ligne
  centrale situé L_d = max(10, 0,8 v) mètres devant, et on braque de
  delta = atan(2 L sin(alpha) / L_d), où alpha est l'angle entre le cap de la
  voiture et la direction du point visé : c'est l'angle qui ferait passer la
  voiture par ce point sur un arc de cercle ;
- vitesse : dans un virage de rayon R, la vitesse limite est sqrt(mu g R) ;
  on vise 0,9 fois cette limite. Pour un virage situé d mètres devant, la
  vitesse autorisée maintenant est celle d'où l'on peut encore freiner à
  temps : d = (v² − v_cible²) / (2 mu g), soit v = sqrt(v_cible² + 2 mu g d).
  La vitesse cible est le minimum sur les 150 m à venir.
"""

from __future__ import annotations

import math

import numpy as np

from env.f1_env import F1Env, wrap_angle
from sim.car import DEFAULT_PARAMS, CarParams

SPEED_MARGIN = 0.9  # fraction de la vitesse limite sqrt(mu g R) visée en virage
HORIZON = 150.0  # distance d'anticipation du profil de vitesse (m)
HORIZON_STEP = 5.0  # pas d'échantillonnage de l'horizon (m)
SPEED_GAIN = 0.5  # gain de la régulation de vitesse (par m/s d'écart)


class ClassicDriver:
    """Deterministic controller acting on a F1Env with a continuous action space."""

    def __init__(self, params: CarParams = DEFAULT_PARAMS):
        self.p = params
        self.v_top = math.sqrt(params.a_max / params.c_d)  # vitesse de pointe sqrt(a_max / c_d)
        self.ahead = np.arange(0.0, HORIZON + HORIZON_STEP, HORIZON_STEP)  # distances d devant (m)

    def target_speed(self, env: F1Env, mu: float) -> float:
        """Highest speed from which every bend of the next 150 m can still be taken."""
        track, s = env.track, env.pos.s
        kappa = np.abs(np.interp((s + self.ahead) % track.length, track.s_points, track.curvature_points,
                                 period=track.length))
        # v_cible(d) = 0,9 sqrt(mu g R) avec R = 1 / |kappa| (vitesse de pointe en ligne droite)
        with np.errstate(divide="ignore"):
            v_bend = np.minimum(SPEED_MARGIN * np.sqrt(mu * self.p.g / kappa), self.v_top)
        # Anticipation du freinage : v = sqrt(v_cible² + 2 mu g d)
        return float(np.min(np.sqrt(v_bend**2 + 2.0 * mu * self.p.g * self.ahead)))

    def steering(self, env: F1Env) -> float:
        """Pure pursuit steering command in [-1, 1]."""
        car, track = env.car, env.track
        look = max(10.0, 0.8 * car.v)  # distance de visée L_d
        s_target = (env.pos.s + look) % track.length
        tx = np.interp(s_target, track.s_points, track.points[:, 0], period=track.length)
        ty = np.interp(s_target, track.s_points, track.points[:, 1], period=track.length)
        alpha = wrap_angle(math.atan2(ty - car.y, tx - car.x) - car.psi)  # angle cap / point visé
        delta = math.atan(2.0 * self.p.L * math.sin(alpha) / look)  # delta = atan(2 L sin(alpha) / L_d)
        return float(np.clip(delta / self.p.delta_max, -1.0, 1.0))

    def act(self, env: F1Env) -> np.ndarray:
        """Action [steer, throttle, brake] for the current state of ``env`` (unwrapped F1Env)."""
        mu = env._effective_mu(env.pos)
        error = self.target_speed(env, mu) - env.car.v
        throttle = float(np.clip(SPEED_GAIN * error, 0.0, 1.0))
        brake = float(np.clip(-SPEED_GAIN * error, 0.0, 1.0))
        return np.array([self.steering(env), throttle, brake], dtype=np.float32)
