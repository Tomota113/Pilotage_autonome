"""Distance sensors: 7 rays from -90° to +90° cast against the track borders.

Tous les rayons sont testés contre tous les segments de bord en une seule
opération NumPy (tableau 7 × 2N) : aucune boucle Python par capteur ni par
segment.
"""

from __future__ import annotations

import numpy as np

from sim.track import Track

SENSOR_ANGLES = np.radians([-90.0, -60.0, -30.0, 0.0, 30.0, 60.0, 90.0])  # relatifs au cap psi
SENSOR_RANGE = 100.0  # portée des capteurs (m)


def read_sensors(
    track: Track,
    x: float,
    y: float,
    psi: float,
    angles: np.ndarray = SENSOR_ANGLES,
    max_range: float = SENSOR_RANGE,
) -> np.ndarray:
    """Distance (m) from (x, y) to the nearest track border along each ray, capped at max_range."""
    theta = psi + angles
    r = np.stack((np.cos(theta), np.sin(theta)), axis=1)  # direction unitaire r de chaque rayon, (K, 2)
    a = track.border_start  # début A de chaque segment de bord, (M, 2)
    e = track.border_vec  # vecteur E du segment, (M, 2)
    w = a - np.array((x, y))  # de l'origine O du rayon au point A

    # Intersection O + t r = A + u E. Par produits vectoriels (r x E noté denom) :
    #   t = (w x E) / (r x E)   distance le long du rayon
    #   u = (w x r) / (r x E)   position sur le segment, valide si 0 <= u <= 1
    denom = r[:, None, 0] * e[None, :, 1] - r[:, None, 1] * e[None, :, 0]  # (K, M)
    w_cross_e = w[:, 0] * e[:, 1] - w[:, 1] * e[:, 0]  # (M,)
    w_cross_r = w[None, :, 0] * r[:, None, 1] - w[None, :, 1] * r[:, None, 0]  # (K, M)
    with np.errstate(divide="ignore", invalid="ignore"):
        t = w_cross_e[None, :] / denom
        u = w_cross_r / denom
    # Rayon parallèle au segment (denom = 0) : pas d'intersection
    hit = (np.abs(denom) > 1e-12) & (t >= 0.0) & (u >= 0.0) & (u <= 1.0)
    dist = np.where(hit, t, np.inf).min(axis=1)
    return np.minimum(dist, max_range)
