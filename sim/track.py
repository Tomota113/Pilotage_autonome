"""Track geometry: closed centreline, width, grip, projection and curvature.

Le circuit suit le format ``f1rl.track/1.0`` du contrat de données. Au
chargement, on valide le fichier puis on précalcule tout ce qui sert à chaque
pas (segments, abscisses curvilignes s, bords de piste, courbure), pour que
les requêtes pendant l'entraînement soient de simples calculs NumPy
vectorisés, sans boucle Python. Pendant un épisode, la projection ne regarde
que les segments proches du dernier indice connu (``hint_index``).
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import NamedTuple

import numpy as np

SCHEMA = "f1rl.track/1.0"
SPLITS = ("train", "test", "demo")
MIN_POINTS = 50
N_CHECKPOINTS = 20
MU_RANGE = (0.3, 1.5)
LENGTH_TOLERANCE = 0.005  # écart relatif admis entre le champ length et la longueur recalculée
PROJECTION_WINDOW = 10  # segments examinés de part et d'autre de hint_index
CURVATURE_SMOOTHING = 5  # points de la moyenne glissante sur la courbure (≈ 25 m)
REQUIRED_FIELDS = ("schema", "id", "name", "split", "centerline", "width", "mu", "start", "checkpoints", "length")


class TrackPosition(NamedTuple):
    """Projection of a point on the centreline."""

    s: float  # abscisse curviligne du projeté, dans [0, length) (m)
    lateral: float  # écart latéral signé au centre, positif à gauche (m)
    index: int  # indice du segment [i, i+1] le plus proche
    heading: float  # cap de la piste sur ce segment (rad)
    half_width: float  # demi-largeur de piste au projeté (m)
    mu: float  # adhérence de la piste au projeté


def _cross(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """2D cross product a_x b_y - a_y b_x (broadcast on the last axis)."""
    return a[..., 0] * b[..., 1] - a[..., 1] * b[..., 0]


class Track:
    """A closed circuit, built from a validated ``track.json`` dictionary."""

    def __init__(self, data: dict):
        validate_track_dict(data)
        self.id: str = data["id"]
        self.name: str = data["name"]
        self.split: str = data["split"]
        self.seed: int | None = data.get("seed")
        self.start_index: int = int(data["start"]["index"])
        self.start_heading: float = float(data["start"]["heading"])
        self.checkpoints = np.asarray(data["checkpoints"], dtype=int)

        self.points = np.asarray(data["centerline"], dtype=float)  # P_i, forme (N, 2)
        self.width = np.asarray(data["width"], dtype=float)
        self.mu = np.asarray(data["mu"], dtype=float)

        # Segments fermés P_i -> P_{i+1} (le dernier rejoint le premier)
        self.seg_vec = np.roll(self.points, -1, axis=0) - self.points  # E_i = P_{i+1} - P_i
        self.seg_len = np.hypot(self.seg_vec[:, 0], self.seg_vec[:, 1])
        if np.any(self.seg_len <= 0.0):
            raise ValueError("centerline has two identical consecutive points")
        # Abscisse curviligne s_i du point P_i ; la longueur est recalculée ici
        self.s_points = np.concatenate(([0.0], np.cumsum(self.seg_len)[:-1]))
        self.length = float(self.seg_len.sum())
        self.seg_heading = np.arctan2(self.seg_vec[:, 1], self.seg_vec[:, 0])
        self.checkpoint_s = self.s_points[self.checkpoints]

        # Courbure signée kappa_i en chaque point (positive = virage à gauche) :
        # angle entre E_{i-1} et E_i divisé par la longueur moyenne des deux segments
        turn = np.angle(np.exp(1j * (self.seg_heading - np.roll(self.seg_heading, 1))))
        self.curvature_raw = turn / (0.5 * (self.seg_len + np.roll(self.seg_len, 1)))
        # Lissage : moyenne glissante circulaire, pour que l'agent voie la forme du
        # virage et non le bruit dû à la discrétisation en points
        k = CURVATURE_SMOOTHING
        padded = np.concatenate((self.curvature_raw[-(k // 2):], self.curvature_raw, self.curvature_raw[: k // 2]))
        self.curvature_points = np.convolve(padded, np.ones(k) / k, mode="valid")

        # Bords de piste : P_i ± n_i * w_i / 2, avec n_i la normale à gauche de la
        # tangente centrée (P_{i+1} - P_{i-1})
        tangent = np.roll(self.points, -1, axis=0) - np.roll(self.points, 1, axis=0)
        tangent /= np.hypot(tangent[:, 0], tangent[:, 1])[:, None]
        normal = np.stack((-tangent[:, 1], tangent[:, 0]), axis=1)
        half = (self.width / 2.0)[:, None]
        self.left_border = self.points + normal * half
        self.right_border = self.points - normal * half
        # Tous les segments de bord (gauche puis droite), pour le lancer de rayons
        starts = np.concatenate((self.left_border, self.right_border))
        ends = np.concatenate((np.roll(self.left_border, -1, axis=0), np.roll(self.right_border, -1, axis=0)))
        self.border_start = starts
        self.border_vec = ends - starts

    @classmethod
    def from_json(cls, path: str | Path) -> Track:
        with open(path, encoding="utf-8") as f:
            return cls(json.load(f))

    def start_pose(self) -> tuple[float, float, float]:
        """Starting position (x, y) and heading psi of the car."""
        x, y = self.points[self.start_index]
        return float(x), float(y), self.start_heading

    def window(self, index: int, half_size: int) -> np.ndarray:
        """Indices of the segments index - half_size .. index + half_size, wrapped around the loop."""
        return (index + np.arange(-half_size, half_size + 1)) % len(self.points)

    def project(self, x: float, y: float, hint_index: int | None = None) -> TrackPosition:
        """Project the point (x, y) on the closest centreline segment.

        With ``hint_index`` (segment found at the previous step), only the
        segments within ``PROJECTION_WINDOW`` of it are searched. If the best
        one lies on the edge of that window, the car may have moved further,
        so the search is redone on the whole track.
        """
        n = len(self.points)
        if hint_index is not None and n > 2 * PROJECTION_WINDOW + 1:
            candidates = self.window(hint_index, PROJECTION_WINDOW)
            k, t, dist2, w = self._closest(x, y, candidates)
            if 0 < k < len(candidates) - 1:
                return self._position(int(candidates[k]), t, dist2, w)
        k, t, dist2, w = self._closest(x, y, np.arange(n))
        return self._position(k, t, dist2, w)

    def _closest(self, x: float, y: float, idx: np.ndarray) -> tuple[int, float, float, np.ndarray]:
        """Among segments ``idx``, the closest one to (x, y): (position in idx, t, squared distance, w)."""
        w = np.array((x, y)) - self.points[idx]  # vecteur P_i -> point, pour chaque segment
        e = self.seg_vec[idx]
        # Paramètre t du projeté sur chaque segment : t = (w . E) / |E|², borné à [0, 1]
        t = np.clip(np.einsum("ij,ij->i", w, e) / self.seg_len[idx] ** 2, 0.0, 1.0)
        d = w - t[:, None] * e  # du projeté au point
        dist2 = np.einsum("ij,ij->i", d, d)
        k = int(np.argmin(dist2))
        return k, float(t[k]), float(dist2[k]), w[k]

    def _position(self, i: int, ti: float, dist2: float, w: np.ndarray) -> TrackPosition:
        j = (i + 1) % len(self.points)
        # Signe de l'écart latéral : produit vectoriel E_i x w_i (> 0 si à gauche)
        side = 1.0 if _cross(self.seg_vec[i], w) >= 0.0 else -1.0
        lateral = side * math.sqrt(dist2)
        s = float(self.s_points[i] + ti * self.seg_len[i]) % self.length
        # Largeur et adhérence interpolées linéairement le long du segment
        half_width = 0.5 * float((1.0 - ti) * self.width[i] + ti * self.width[j])
        mu = float((1.0 - ti) * self.mu[i] + ti * self.mu[j])
        return TrackPosition(s, lateral, i, float(self.seg_heading[i]), half_width, mu)

    def is_off_track(self, pos: TrackPosition) -> bool:
        """Off track when the distance to the centreline exceeds the half-width."""
        return abs(pos.lateral) > pos.half_width

    def progress_delta(self, s_prev: float, s_new: float) -> float:
        """Signed progress Δs (m) from s_prev to s_new, unwrapped across the finish line."""
        # On ramène Δs dans [-length/2, length/2) : passer la ligne d'arrivée
        # (s qui retombe près de 0) compte comme une petite avance, pas un recul.
        half = self.length / 2.0
        return (s_new - s_prev + half) % self.length - half

    def curvature_at(self, s: float) -> float:
        """Smoothed signed curvature kappa (1/m) at arc length s, interpolated between points."""
        return float(np.interp(s % self.length, self.s_points, self.curvature_points, period=self.length))

    def curvature_ahead(self, s: float, d: float) -> float:
        """Smoothed signed curvature (1/m) at distance d ahead of arc length s."""
        return self.curvature_at(s + d)


def validate_track_dict(data: dict) -> None:
    """Check a track dictionary against the data contract; raise ValueError if invalid."""
    missing = [f for f in REQUIRED_FIELDS if f not in data]
    if missing:
        raise ValueError(f"missing fields: {missing}")
    if data["schema"] != SCHEMA:
        raise ValueError(f"unknown schema {data['schema']!r}, expected {SCHEMA!r}")
    if not isinstance(data["id"], str) or not re.fullmatch(r"[a-z0-9_]+", data["id"]):
        raise ValueError(f"invalid id {data['id']!r}: lowercase letters, digits and '_' only")
    if data["split"] not in SPLITS:
        raise ValueError(f"split must be one of {SPLITS}, got {data['split']!r}")

    points = np.asarray(data["centerline"], dtype=float)
    n = len(points)
    if points.ndim != 2 or points.shape[1] != 2:
        raise ValueError("centerline must be a list of [x, y]")
    if n < MIN_POINTS:
        raise ValueError(f"centerline needs at least {MIN_POINTS} points, got {n}")
    if len(data["width"]) != n or len(data["mu"]) != n:
        raise ValueError("centerline, width and mu must have the same length")
    width = np.asarray(data["width"], dtype=float)
    mu = np.asarray(data["mu"], dtype=float)
    if not (np.all(np.isfinite(points)) and np.all(np.isfinite(width)) and np.all(np.isfinite(mu))):
        raise ValueError("centerline, width and mu must be finite numbers")
    if np.any(width <= 0.0):
        raise ValueError("width must be > 0")
    if np.any(mu < MU_RANGE[0]) or np.any(mu > MU_RANGE[1]):
        raise ValueError(f"mu must be in {MU_RANGE}")

    start = data["start"]
    if not isinstance(start, dict) or "index" not in start or "heading" not in start:
        raise ValueError("start must be {'index': int, 'heading': float}")
    if not 0 <= start["index"] < n:
        raise ValueError("start.index out of range")

    cps = data["checkpoints"]
    if len(cps) != N_CHECKPOINTS:
        raise ValueError(f"expected {N_CHECKPOINTS} checkpoints, got {len(cps)}")
    if any(not 0 <= c < n for c in cps) or any(b <= a for a, b in zip(cps, cps[1:])):
        raise ValueError("checkpoints must be strictly increasing indices in range")
    if cps[0] != start["index"]:
        raise ValueError("first checkpoint must equal start.index")

    # Le champ length doit correspondre à la longueur réelle de la ligne centrale fermée
    seg = np.roll(points, -1, axis=0) - points
    computed = float(np.hypot(seg[:, 0], seg[:, 1]).sum())
    if not abs(float(data["length"]) - computed) <= LENGTH_TOLERANCE * computed:
        raise ValueError(f"length {data['length']} does not match the centreline length {computed:.1f} m")
