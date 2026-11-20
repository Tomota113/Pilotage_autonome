"""Car physics: kinematic bicycle model with a grip-limited turning radius.

Choix de conception : fonctions pures sur un état immuable (``CarState`` gelé).
``step`` ne modifie rien et renvoie un nouvel état ; le résultat ne dépend donc
que des entrées, ce qui rend le simulateur déterministe et simple à tester.

On utilise ``math`` (bibliothèque standard) plutôt que NumPy : l'état d'une
seule voiture est fait de 5 scalaires, et ``math`` est nettement plus rapide
que NumPy sur des scalaires. NumPy servira là où il y a des tableaux
(capteurs, piste).
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class CarParams:
    """Vehicle parameters (valeurs de départ de CLAUDE.md)."""

    L: float = 3.6  # empattement L (m)
    l_r: float = 1.8  # distance centre de gravité -> essieu arrière l_r (m)
    a_max: float = 10.0  # accélération motrice maximale a_max (m/s²)
    b_max: float = 15.0  # décélération de freinage maximale b_max (m/s²)
    c_d: float = 0.0025  # coefficient de traînée c_d (1/m)
    delta_max: float = 0.4  # angle de braquage maximal delta_max (rad)
    delta_rate_max: float = 2.0  # vitesse de braquage maximale (rad/s)
    g: float = 9.81  # gravité g (m/s²)


@dataclass(frozen=True)
class CarState:
    """Car state: position (m), heading psi (rad), speed v (m/s), steering delta (rad)."""

    x: float = 0.0
    y: float = 0.0
    psi: float = 0.0
    v: float = 0.0
    delta: float = 0.0


DEFAULT_PARAMS = CarParams()
PHYSICS_DT = 0.01  # pas physique (s)
ACTION_REPEAT = 5  # sous-pas par décision de l'agent : 5 * 0,01 s = 0,05 s


def _clip(value: float, low: float, high: float) -> float:
    return min(max(value, low), high)


def path_curvature(delta: float, params: CarParams = DEFAULT_PARAMS) -> float:
    """Signed curvature (1/m) of the centre-of-gravity path asked by steering angle delta."""
    # beta = atan((l_r / L) * tan(delta)) : angle de dérive au centre de gravité
    beta = math.atan((params.l_r / params.L) * math.tan(delta))
    # Rayon du centre de gravité : R = l_r / sin(beta), donc courbure kappa = 1/R = sin(beta) / l_r
    return math.sin(beta) / params.l_r


def _substep(
    state: CarState,
    steer: float,
    throttle: float,
    brake: float,
    mu: float,
    dt: float,
    p: CarParams,
) -> tuple[CarState, bool]:
    """Advance the car by one physics step dt. Returns (new_state, slip)."""
    # --- Braquage : la cible est steer * delta_max, atteinte à vitesse limitée ---
    delta_target = steer * p.delta_max
    max_change = p.delta_rate_max * dt  # |d(delta)| <= delta_rate_max * dt
    delta = state.delta + _clip(delta_target - state.delta, -max_change, max_change)
    delta = _clip(delta, -p.delta_max, p.delta_max)

    # --- Vitesse (mise à jour en premier : Euler semi-implicite) ---
    # Freinage plafonné par l'adhérence : a_frein = min(brake * b_max, mu * g)
    a_brake = min(brake * p.b_max, mu * p.g)
    # dv/dt = throttle * a_max - a_frein - c_d * v²
    dv_dt = throttle * p.a_max - a_brake - p.c_d * state.v**2
    v = max(0.0, state.v + dv_dt * dt)  # v ne devient jamais négatif

    # --- Courbure limitée par l'adhérence (sous-virage) ---
    kappa = path_curvature(delta, p)  # kappa = 1/R, R = rayon visé
    # Accélération latérale demandée : a_lat = v² / R = v² * |kappa|
    slip = v * v * abs(kappa) > mu * p.g
    if slip:
        # Au-delà de mu * g, le rayon effectif devient R_eff = v² / (mu * g),
        # donc kappa_eff = 1 / R_eff = mu * g / v² (même signe que kappa).
        # Ici v > 0 est garanti, car v² * |kappa| > mu * g >= 0.
        kappa = math.copysign(mu * p.g / (v * v), kappa)
    # Angle de dérive effectif : sin(beta_eff) = l_r * kappa_eff
    beta = math.asin(p.l_r * kappa)

    # --- Position et cap avec la nouvelle vitesse v ---
    # dx/dt = v cos(psi + beta) ; dy/dt = v sin(psi + beta)
    x = state.x + v * math.cos(state.psi + beta) * dt
    y = state.y + v * math.sin(state.psi + beta) * dt
    # dpsi/dt = (v / l_r) * sin(beta) = v * kappa_eff
    psi = state.psi + (v / p.l_r) * math.sin(beta) * dt

    return CarState(x=x, y=y, psi=psi, v=v, delta=delta), slip


def step(
    state: CarState,
    command: tuple[float, float, float],
    mu: float,
    dt: float = PHYSICS_DT,
    action_repeat: int = ACTION_REPEAT,
    params: CarParams = DEFAULT_PARAMS,
) -> tuple[CarState, bool]:
    """Apply command = (steer, throttle, brake) for ``action_repeat`` physics steps of ``dt``.

    steer is clipped to [-1, 1]; throttle and brake to [0, 1]. ``mu`` is the
    tyre-road friction coefficient. Returns the new state and ``slip``: True
    if the grip limit was exceeded during at least one physics step.
    """
    if mu < 0.0:
        raise ValueError(f"mu must be >= 0, got {mu}")
    if dt <= 0.0 or action_repeat < 1:
        raise ValueError("dt must be > 0 and action_repeat >= 1")

    steer_cmd, throttle_cmd, brake_cmd = command
    steer = _clip(float(steer_cmd), -1.0, 1.0)
    throttle = _clip(float(throttle_cmd), 0.0, 1.0)
    brake = _clip(float(brake_cmd), 0.0, 1.0)

    slip = False
    for _ in range(action_repeat):
        state, sub_slip = _substep(state, steer, throttle, brake, mu, dt, params)
        slip = slip or sub_slip
    return state, slip
