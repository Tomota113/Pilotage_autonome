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

# Fraction de la vitesse limite du virage visée : 0,9 pour le modèle v1 ; 0,85 pour la F1, dont
# le cercle de friction (freiner en tournant réduit l'adhérence latérale) demande plus de marge
SPEED_MARGIN = {"v1": 0.9, "f1_2024": 0.85}
HORIZON = 150.0  # distance d'anticipation du profil de vitesse (m)
HORIZON_STEP = 5.0  # pas d'échantillonnage de l'horizon (m)
SPEED_GAIN = 0.5  # gain de la régulation de vitesse (par m/s d'écart)
# Distance de visée L_d = max(10, k v) : k = 0,8 pour le modèle v1 (≤ 228 km/h) ; pour la F1
# (≤ 343 km/h) une visée aussi longue couperait les chicanes, d'où k plus petit.
LOOK_GAIN = {"v1": 0.8, "f1_2024": 0.6}


class ClassicDriver:
    """Deterministic controller acting on a F1Env with a continuous action space.

    Il lit les paramètres de la voiture dans l'environnement (``env.car_params``) : modèle v1
    ou monoplace F1 avec appui aérodynamique (sa vitesse en virage en tient compte ; pour
    anticiper le freinage, il ne compte prudemment que l'adhérence à basse vitesse).
    """

    def __init__(self):
        self.ahead = np.arange(0.0, HORIZON + HORIZON_STEP, HORIZON_STEP)  # distances d devant (m)

    def target_speed(self, env: F1Env, mu: float) -> float:
        """Highest speed from which every bend of the next 150 m can still be taken."""
        from sim.raceline import _corner_speed

        p, track, s = env.car_params, env.track, env.pos.s
        kappa = np.interp((s + self.ahead) % track.length, track.s_points, track.curvature_points,
                          period=track.length)
        # v_cible(d) = 0,9 × vitesse limite du virage (v1 : sqrt(mu g R) ; F1 : avec l'appui aéro)
        # marge appliquée avant le plafond : en ligne droite, la cible reste la vitesse de pointe
        v_bend = np.minimum(SPEED_MARGIN.get(env.car_model, 0.9) * _corner_speed(kappa, mu, p, cap=False),
                            p.top_speed)
        # Anticipation du freinage : v = sqrt(v_cible² + 2 a d), a = adhérence à basse vitesse
        brake = p.grip(mu, 0.0)
        return float(np.min(np.sqrt(v_bend**2 + 2.0 * brake * self.ahead)))

    def steering(self, env: F1Env) -> float:
        """Pure pursuit steering command in [-1, 1]."""
        p, car, track = env.car_params, env.car, env.track
        look = max(10.0, LOOK_GAIN.get(env.car_model, 0.8) * car.v)  # distance de visée L_d
        s_target = (env.pos.s + look) % track.length
        tx = np.interp(s_target, track.s_points, track.points[:, 0], period=track.length)
        ty = np.interp(s_target, track.s_points, track.points[:, 1], period=track.length)
        alpha = wrap_angle(math.atan2(ty - car.y, tx - car.x) - car.psi)  # angle cap / point visé
        delta = math.atan(2.0 * p.L * math.sin(alpha) / look)  # delta = atan(2 L sin(alpha) / L_d)
        return float(np.clip(delta / p.delta_max, -1.0, 1.0))

    def act(self, env: F1Env) -> np.ndarray:
        """Action [steer, throttle, brake] for the current state of ``env`` (unwrapped F1Env)."""
        mu = env._effective_mu(env.pos)
        error = self.target_speed(env, mu) - env.car.v
        throttle = float(np.clip(SPEED_GAIN * error, 0.0, 1.0))
        brake = float(np.clip(-SPEED_GAIN * error, 0.0, 1.0))
        return np.array([self.steering(env), throttle, brake], dtype=np.float32)
