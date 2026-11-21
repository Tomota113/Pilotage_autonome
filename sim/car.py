"""Car physics: kinematic bicycle model with a grip-limited turning radius, optional aerodynamics.

Choix de conception : fonctions pures sur un état immuable (``CarState`` gelé).
``step`` ne modifie rien et renvoie un nouvel état ; le résultat ne dépend donc
que des entrées, ce qui rend le simulateur déterministe et simple à tester.

Deux jeux de paramètres :
- ``DEFAULT_PARAMS`` (modèle v1, celui de CLAUDE.md) : accélération constante, traînée,
  adhérence mu g sans appui aérodynamique. Garde les résultats des premiers runs reproductibles.
- ``F1_2024`` : monoplace de F1 réaliste. 800 kg, environ 700 kW aux roues, traînée
  (C_D A ≈ 1,3 m²) et appui aérodynamique (C_L A ≈ 4,5 m²) : la force normale vaut
  m (g + k_L v²), donc l'adhérence augmente avec la vitesse (≈ 1,8 g à l'arrêt,
  ≈ 5 g vers 255 km/h). Pneus slicks (mu ≈ 1,8), cercle de friction combiné
  (sqrt(a_long² + a_lat²) <= mu N / m), vitesse de pointe ≈ 343 km/h.
  Calibrage (21/11/2026) : sur la trajectoire idéale, les temps au tour simulés sont en
  moyenne 3 % au-dessus des poles officielles 2024 (FIA) de Monza, Silverstone, Suzuka,
  Hungaroring et Red Bull Ring (voir docs/EXPLICATIONS.md).

On utilise ``math`` (bibliothèque standard) plutôt que NumPy : l'état d'une
seule voiture est fait de 5 scalaires, et ``math`` est nettement plus rapide
que NumPy sur des scalaires.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class CarParams:
    """Vehicle parameters. The defaults are the v1 model of CLAUDE.md (no aerodynamics)."""

    L: float = 3.6  # empattement L (m)
    l_r: float = 1.8  # distance centre de gravité -> essieu arrière l_r (m)
    a_max: float = 10.0  # accélération motrice maximale a_max (m/s²)
    b_max: float = 15.0  # décélération de freinage maximale b_max (m/s²)
    c_d: float = 0.0025  # coefficient de traînée c_d = ½ ρ C_D A / m (1/m)
    delta_max: float = 0.4  # angle de braquage maximal delta_max (rad)
    delta_rate_max: float = 2.0  # vitesse de braquage maximale (rad/s)
    g: float = 9.81  # gravité g (m/s²)
    # --- Extensions « F1 » (valeurs neutres = modèle v1) ---
    mu_tyre: float = 1.0  # adhérence nominale des pneus (multipliée par le mu de la piste et de l'épisode)
    k_lift: float = 0.0  # appui aérodynamique k_L = ½ ρ C_L A / m (1/m) : force normale m (g + k_L v²)
    power_over_mass: float = math.inf  # puissance massique P / m (W/kg) : accélération <= P / (m v)
    c_rr: float = 0.0  # résistance au roulement (fraction de g)
    friction_circle: bool = False  # True : accélérations longitudinale et latérale partagent l'adhérence

    @property
    def top_speed(self) -> float:
        """Speed (m/s) where the engine force equals drag + rolling resistance."""
        if math.isinf(self.power_over_mass):
            return math.sqrt(max(self.a_max - self.c_rr * self.g, 0.0) / self.c_d)
        lo, hi = 0.1, 200.0  # bissection sur P/(m v) = c_d v² + c_rr g
        for _ in range(80):
            v = 0.5 * (lo + hi)
            if min(self.a_max, self.power_over_mass / v) > self.c_d * v * v + self.c_rr * self.g:
                lo = v
            else:
                hi = v
        return lo

    def grip(self, mu: float, v: float) -> float:
        """Largest acceleration (m/s²) the tyres can transmit at speed v: mu mu_tyre (g + k_L v²)."""
        return mu * self.mu_tyre * (self.g + self.k_lift * v * v)


@dataclass(frozen=True)
class CarState:
    """Car state: position (m), heading psi (rad), speed v (m/s), steering delta (rad)."""

    x: float = 0.0
    y: float = 0.0
    psi: float = 0.0
    v: float = 0.0
    delta: float = 0.0


DEFAULT_PARAMS = CarParams()

_RHO = 1.225  # masse volumique de l'air (kg/m³)
_MASS = 800.0  # masse minimale réglementaire d'une F1 2024 avec pilote, arrondie (kg)
F1_2024 = CarParams(
    L=3.6,  # empattement d'une F1 actuelle ≈ 3,6 m
    l_r=1.6,  # répartition des masses ≈ 45 % avant / 55 % arrière
    a_max=12.0,  # limite de motricité à basse vitesse (0 à 100 km/h en ≈ 2,5 s)
    b_max=60.0,  # freins carbone : la limite réelle est l'adhérence (≈ 5 à 6 g à haute vitesse)
    c_d=0.5 * _RHO * 1.3 / _MASS,  # C_D A ≈ 1,3 m²
    delta_max=0.4,
    delta_rate_max=2.0,
    mu_tyre=1.8,  # pneus slicks sur piste sèche (pic d'adhérence)
    k_lift=0.5 * _RHO * 4.5 / _MASS,  # C_L A ≈ 4,5 m² (rapport portance / traînée ≈ 3,5)
    power_over_mass=700_000.0 / _MASS,  # ≈ 700 kW aux roues (moteur thermique + hybride)
    c_rr=0.012,
    friction_circle=True,
)

DECISION_DT = 0.05  # durée d'une décision de l'agent (s)
SUBSTEPS = 5  # sous-pas physiques par décision (action repeat)
PHYSICS_DT = DECISION_DT / SUBSTEPS  # pas physique : 0,05 / 5 = 0,01 s


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
    kappa = path_curvature(delta, p)  # kappa = 1/R, R = rayon visé

    # --- Vitesse (mise à jour en premier : Euler semi-implicite) ---
    v0 = state.v
    grip = p.grip(mu, v0)  # adhérence disponible : mu mu_tyre (g + k_L v²)
    if p.friction_circle:
        # Cercle de friction : ce qui sert à tourner (a_lat = v² kappa) n'est plus disponible
        # pour accélérer ou freiner : a_long <= sqrt(grip² − a_lat²)
        a_lat = min(v0 * v0 * abs(kappa), grip)
        long_budget = math.sqrt(max(grip * grip - a_lat * a_lat, 0.0))
    else:
        long_budget = grip  # modèle v1 : seul le freinage est plafonné, à mu g
    # Accélération motrice : limitée par a_max (motricité) et par la puissance P / (m v)
    engine = p.a_max if v0 < 1e-3 else min(p.a_max, p.power_over_mass / v0)
    a_drive = throttle * (min(engine, long_budget) if p.friction_circle else engine)
    # Freinage plafonné par l'adhérence : a_frein = min(brake * b_max, budget)
    a_brake = min(brake * p.b_max, long_budget)
    # dv/dt = a_moteur − a_frein − c_d v² − c_rr g
    resist = p.c_d * v0 * v0 + (p.c_rr * p.g if v0 > 0.0 else 0.0)
    v = max(0.0, v0 + (a_drive - a_brake - resist) * dt)  # v ne devient jamais négatif

    # --- Courbure limitée par l'adhérence (sous-virage) ---
    # Accélération latérale demandée : a_lat = v² / R = v² * |kappa|
    grip_v = p.grip(mu, v)
    slip = v * v * abs(kappa) > grip_v
    if slip:
        # Au-delà, le rayon effectif devient R_eff = v² / adhérence (avec l'appui aéro : g + k_L v²)
        # Ici v > 0 est garanti, car v² * |kappa| > adhérence >= 0.
        kappa = math.copysign(grip_v / (v * v), kappa)
    # Angle de dérive effectif : sin(beta_eff) = l_r * kappa_eff
    beta = math.asin(_clip(p.l_r * kappa, -1.0, 1.0))

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
    dt: float = DECISION_DT,
    substeps: int = SUBSTEPS,
    params: CarParams = DEFAULT_PARAMS,
) -> tuple[CarState, bool]:
    """Apply command = (steer, throttle, brake) during ``dt`` seconds, split in ``substeps`` physics steps.

    Each physics step lasts ``dt / substeps`` (0.01 s by default).

    steer is clipped to [-1, 1]; throttle and brake to [0, 1]. ``mu`` is the
    grip factor of the road (episode factor × local track mu). Returns the new state and
    ``slip``: True if the grip limit was exceeded during at least one physics step.
    """
    if mu < 0.0:
        raise ValueError(f"mu must be >= 0, got {mu}")
    if dt <= 0.0 or substeps < 1:
        raise ValueError("dt must be > 0 and substeps >= 1")

    steer_cmd, throttle_cmd, brake_cmd = command
    steer = _clip(float(steer_cmd), -1.0, 1.0)
    throttle = _clip(float(throttle_cmd), 0.0, 1.0)
    brake = _clip(float(brake_cmd), 0.0, 1.0)

    h = dt / substeps  # durée d'un sous-pas physique
    slip = False
    for _ in range(substeps):
        state, sub_slip = _substep(state, steer, throttle, brake, mu, h, params)
        slip = slip or sub_slip
    return state, slip
