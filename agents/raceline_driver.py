"""Racing-line driver: follows the minimum-curvature line at the fastest feasible speed.

Référence non-RL plus forte que le pilote classique : au lieu de la ligne centrale à 90 % de
la limite, il suit la trajectoire idéale (sim/raceline.py) et vise la vitesse du profil
optimal, recalculé pour l'adhérence réelle (il connaît mu, comme le pilote classique).
- direction : poursuite de cible sur la trajectoire idéale, visée L_d = max(6, 0,35 v)
  (plus loin, la voiture couperait l'intérieur des chicanes abordées à 300 km/h) ;
- vitesse : profil optimal × SPEED_MARGIN, lu un peu en avance pour compenser le temps de
  réaction (la commande n'agit que pendant 0,05 s et le volant tourne à vitesse limitée).
"""

from __future__ import annotations

import math

import numpy as np

from env.f1_env import F1Env, wrap_angle
from sim.raceline import MARGIN, RacingLine, racing_line, speed_profile

SPEED_MARGIN = 0.99  # fraction de la vitesse optimale visée (marge pour les erreurs de suivi)
ANTICIPATION = 0.4  # secondes : on vise la vitesse minimale du profil sur les 0,4 s à venir
SEARCH_WINDOW = 40  # points examinés autour de la dernière position sur la trajectoire
SPEED_GAIN = 0.6
EXTRA_MARGIN = 0.3  # le pilote suit une ligne 30 cm plus loin des bords que la ligne théorique


class RacelineDriver:
    """Deterministic controller acting on a F1Env with a continuous action space."""

    def __init__(self):
        self._lines: dict[str, RacingLine] = {}
        self._profiles: dict[tuple, np.ndarray] = {}
        self._index: int | None = None
        self._episode_key = None

    def line(self, track) -> RacingLine:
        if track.id not in self._lines:
            self._lines[track.id] = racing_line(track, margin=MARGIN + EXTRA_MARGIN)
        return self._lines[track.id]

    def profile(self, track, mu: float, params) -> np.ndarray:
        key = (track.id, round(mu, 4), params)
        if key not in self._profiles:
            self._profiles[key] = speed_profile(self.line(track), mu, params).speed
        return self._profiles[key]

    def _locate(self, line: RacingLine, x: float, y: float) -> int:
        n = len(line.points)
        if self._index is None:
            idx = np.arange(n)
        else:
            idx = (self._index + np.arange(-SEARCH_WINDOW, SEARCH_WINDOW + 1)) % n
        d2 = np.sum((line.points[idx] - (x, y)) ** 2, axis=1)
        self._index = int(idx[int(np.argmin(d2))])
        return self._index

    def act(self, env: F1Env) -> np.ndarray:
        track, car = env.track, env.car
        if self._episode_key != (id(env), track.id) or env.steps == 0:  # nouvel épisode
            self._index, self._episode_key = None, (id(env), track.id)
        line = self.line(track)
        p = env.car_params
        speeds = self.profile(track, env._effective_mu(env.pos), p)
        n = len(line.points)
        i = self._locate(line, car.x, car.y)

        # Direction : poursuite de cible, delta = atan(2 L sin(alpha) / L_d)
        look = max(6.0, 0.35 * car.v)
        s_target = (line.s[i] + look) % line.length
        tx = np.interp(s_target, line.s, line.points[:, 0], period=line.length)
        ty = np.interp(s_target, line.s, line.points[:, 1], period=line.length)
        alpha = wrap_angle(math.atan2(ty - car.y, tx - car.x) - car.psi)
        steer = float(np.clip(math.atan(2.0 * p.L * math.sin(alpha) / look) / p.delta_max, -1.0, 1.0))

        # Vitesse : minimum du profil sur la distance parcourue pendant ANTICIPATION secondes
        ahead = max(1, int(car.v * ANTICIPATION / max(line.length / n, 1e-6)))
        window = speeds[(i + np.arange(ahead + 1)) % n]
        error = SPEED_MARGIN * float(window.min()) - car.v
        throttle = float(np.clip(SPEED_GAIN * error, 0.0, 1.0))
        brake = float(np.clip(-SPEED_GAIN * error, 0.0, 1.0))
        return np.array([steer, throttle, brake], dtype=np.float32)
