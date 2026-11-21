"""Racing line: minimum-curvature path inside the track, and the fastest speed profile along it.

Trajectoire : on décale chaque point de la ligne centrale le long de sa normale,
P_i = C_i + alpha_i n_i, avec |alpha_i| <= demi-largeur − marge. On cherche les alpha_i qui
minimisent la somme des courbures au carré, approchée par les différences secondes :
    min  somme_i || P_{i-1} − 2 P_i + P_{i+1} ||²
C'est un problème quadratique sous bornes (min ½ alphaᵀ H alpha − fᵀ alpha, H = AᵀA creuse à
5 diagonales), résolu exactement par une méthode à ensemble actif : on fixe aux bornes les
points qui les dépassent, on résout le système linéaire creux pour les autres, et on libère
les points dont le multiplicateur de Lagrange a le mauvais signe, jusqu'à ce que les
conditions d'optimalité (KKT) soient vérifiées. C'est l'approximation classique de la
« trajectoire idéale » : une ligne qui coupe les virages au plus large pour y passer plus vite.

Profil de vitesse, avec la physique de sim/car.py :
- limite en virage : v² |kappa| <= mu g, soit v <= sqrt(mu g / |kappa|) (et v <= vitesse de pointe) ;
- accélération : dv/dt = a_max − c_d v² (passe avant) ;
- freinage : décélération mu g + c_d v² (passe arrière, freinage plafonné par l'adhérence).
Le résultat est la vitesse la plus élevée possible en chaque point ; le temps au tour qui en
découle est une référence théorique (borne inférieure pour ce modèle de voiture sur cette ligne).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import sparse
from scipy.sparse.linalg import spsolve

from sim.car import DEFAULT_PARAMS, CarParams
from sim.track import Track

MARGIN = 1.6  # distance minimale entre le centre de la voiture et le bord (m) : demi-largeur + sécurité
REGULARIZATION = 1e-6  # petite préférence pour la ligne centrale : rend H inversible (translation libre)


@dataclass(frozen=True)
class RacingLine:
    points: np.ndarray  # (N, 2) positions de la trajectoire (m)
    s: np.ndarray  # abscisse curviligne de chaque point (m)
    curvature: np.ndarray  # courbure signée (1/m)
    length: float  # longueur de la boucle (m)


@dataclass(frozen=True)
class SpeedProfile:
    speed: np.ndarray  # vitesse maximale en chaque point (m/s)
    lap_time: float  # temps au tour théorique (s)


def _left_normals(points: np.ndarray) -> np.ndarray:
    tangent = np.roll(points, -1, axis=0) - np.roll(points, 1, axis=0)
    tangent /= np.hypot(tangent[:, 0], tangent[:, 1])[:, None]
    return np.stack((-tangent[:, 1], tangent[:, 0]), axis=1)


def _geometry(points: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
    """Arc length of each point, smoothed signed curvature and loop length of a closed polyline."""
    seg = np.roll(points, -1, axis=0) - points
    seg_len = np.hypot(seg[:, 0], seg[:, 1])
    heading = np.arctan2(seg[:, 1], seg[:, 0])
    turn = np.angle(np.exp(1j * (heading - np.roll(heading, 1))))
    kappa = turn / (0.5 * (seg_len + np.roll(seg_len, 1)))
    kappa = (np.roll(kappa, 1) + kappa + np.roll(kappa, -1)) / 3.0  # léger lissage
    return np.concatenate(([0.0], np.cumsum(seg_len)[:-1])), kappa, float(seg_len.sum())


def _box_qp(h: sparse.csc_matrix, f: np.ndarray, lo: np.ndarray, hi: np.ndarray, max_iter: int = 20000) -> np.ndarray:
    """Solve min ½ xᵀHx − fᵀx subject to lo <= x <= hi (H sparse, symmetric positive definite).

    Méthode primale à ensemble actif : on part d'un point admissible (la ligne centrale) ; à
    chaque itération on résout le système pour les points libres. Si la solution sort de la
    piste, on avance vers elle jusqu'à la première borne touchée et on bloque ce point ; sinon
    on vérifie les multiplicateurs et on libère le point le plus « mal bloqué ». Converge en un
    nombre fini d'itérations.
    """
    n = len(f)
    state = np.zeros(n, dtype=np.int8)  # 0 libre, −1 sur la borne basse, +1 sur la borne haute
    x = np.clip(np.zeros(n), lo, hi)
    for _ in range(max_iter):
        free = state == 0
        target = x.copy()
        if free.any():
            fixed = ~free
            rhs = f[free] - (h[free][:, fixed] @ x[fixed] if fixed.any() else 0.0)
            target[free] = spsolve(h[free][:, free], rhs)
        step = target - x
        with np.errstate(divide="ignore", invalid="ignore"):
            t_hi = np.where(free & (target > hi + 1e-12), (hi - x) / step, np.inf)
            t_lo = np.where(free & (target < lo - 1e-12), (lo - x) / step, np.inf)
        t = min(t_hi.min(), t_lo.min())
        if t < 1.0:  # la solution sort de la piste : on avance jusqu'à la première borne
            x = np.clip(x + t * step, lo, hi)
            k_hi, k_lo = np.argmin(t_hi), np.argmin(t_lo)
            if t_hi[k_hi] <= t_lo[k_lo]:
                state[k_hi], x[k_hi] = 1, hi[k_hi]
            else:
                state[k_lo], x[k_lo] = -1, lo[k_lo]
            continue
        x = target
        grad = h @ x - f
        # Optimalité : sur la borne basse le gradient doit être >= 0, sur la borne haute <= 0
        wrong = np.where(state < 0, -grad, np.where(state > 0, grad, 0.0))
        k = int(np.argmax(wrong))
        if wrong[k] <= 1e-9:
            return x
        state[k] = 0  # ce point peut s'éloigner du bord
    raise RuntimeError("racing line optimisation did not converge")


def _resample(points: np.ndarray, n: int) -> np.ndarray:
    """n points regularly spaced along a closed polyline."""
    closed = np.vstack((points, points[:1]))
    s = np.concatenate(([0.0], np.cumsum(np.hypot(*np.diff(closed, axis=0).T))))
    s_new = np.arange(n) * (s[-1] / n)
    return np.stack((np.interp(s_new, s, closed[:, 0]), np.interp(s_new, s, closed[:, 1])), axis=1)


def _min_curvature_step(ref: np.ndarray, lo: np.ndarray, hi: np.ndarray) -> np.ndarray:
    """Offsets alpha (lo <= alpha <= hi) along the normals of ``ref`` minimising the squared second differences."""
    n = len(ref)
    normal = _left_normals(ref)
    # D2 : différence seconde circulaire, (D2 x)_i = x_{i-1} − 2 x_i + x_{i+1}
    idx = np.arange(n)
    d2 = sparse.csr_matrix((np.concatenate((np.ones(n), -2 * np.ones(n), np.ones(n))),
                            (np.concatenate((idx, idx, idx)), np.concatenate(((idx - 1) % n, idx, (idx + 1) % n)))),
                           shape=(n, n))
    a = sparse.vstack((d2 @ sparse.diags(normal[:, 0]), d2 @ sparse.diags(normal[:, 1]))).tocsr()
    b = -np.concatenate((d2 @ ref[:, 0], d2 @ ref[:, 1]))
    h = (a.T @ a + REGULARIZATION * sparse.identity(n)).tocsc()
    return ref + normal * _box_qp(h, a.T @ b, lo, hi)[:, None]


def racing_line(track: Track, margin: float = MARGIN, iterations: int = 3) -> RacingLine:
    """Minimum-curvature line inside the track.

    La différence seconde n'est proportionnelle à la courbure que si les points sont également
    espacés ; or, en se décalant vers l'intérieur d'un virage, les points se rapprochent et
    l'optimisation favoriserait l'intérieur. On itère donc : on rééchantillonne la ligne
    obtenue à pas constant, puis on la ré-optimise autour d'elle-même, les bornes étant
    toujours les bords de la piste (distance réelle aux bords, mesurée par projection).
    """
    n = len(track.points)
    ref = track.points.copy()
    for k in range(iterations):
        if k:
            ref = _resample(ref, n)
        lateral, half, hint = np.empty(n), np.empty(n), None
        for i, (x, y) in enumerate(ref):
            pos = track.project(x, y, hint_index=hint)
            lateral[i], half[i], hint = pos.lateral, pos.half_width, pos.index
        room = np.maximum(half - margin, 0.0)
        # Décalage permis le long de la normale de la ligne : jusqu'aux bords (moins la marge)
        lo, hi = np.minimum(-room - lateral, 0.0), np.maximum(room - lateral, 0.0)
        ref = _min_curvature_step(ref, lo, hi)
    s, kappa, length = _geometry(ref)
    return RacingLine(points=ref, s=s, curvature=kappa, length=length)


def speed_profile(line: RacingLine, mu: float, params: CarParams = DEFAULT_PARAMS) -> SpeedProfile:
    """Fastest speed at each point of a closed line, for the grip mu and the car model."""
    n = len(line.points)
    ds = np.diff(np.append(line.s, line.length))  # longueur du segment i -> i+1
    v_top = np.sqrt(params.a_max / params.c_d)
    v_lim = np.minimum(np.sqrt(mu * params.g / np.maximum(np.abs(line.curvature), 1e-9)), v_top)
    # On part du point le plus contraignant (vitesse limite minimale) pour boucler proprement
    start = int(np.argmin(v_lim))
    order = (start + np.arange(n)) % n
    v = v_lim[order].copy()
    d = ds[order]
    for k in range(n - 1):  # passe avant : accélération a_max − c_d v²
        v[k + 1] = min(v[k + 1], np.sqrt(v[k] ** 2 + 2.0 * (params.a_max - params.c_d * v[k] ** 2) * d[k]))
    v_end = np.sqrt(v[-1] ** 2 + 2.0 * (params.a_max - params.c_d * v[-1] ** 2) * d[-1])
    v[0] = min(v[0], v_end)
    for k in range(n - 1, 0, -1):  # passe arrière : freinage mu g + c_d v² (on remonte le temps)
        nxt = v[(k + 1) % n]
        v[k] = min(v[k], np.sqrt(nxt ** 2 + 2.0 * (mu * params.g + params.c_d * nxt ** 2) * d[k]))
    speed = np.empty(n)
    speed[order] = v
    v_next = np.roll(speed, -1)
    lap_time = float(np.sum(2.0 * ds / (speed + v_next)))
    return SpeedProfile(speed=speed, lap_time=lap_time)
