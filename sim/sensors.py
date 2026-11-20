"""Distance sensors: 7 rays from -90° to +90° cast against the track borders.

Tous les rayons sont testés contre les segments de bord en une seule
opération NumPy (tableau 7 × M) : aucune boucle Python par capteur ni par
segment. Pendant un épisode, on ne garde que les segments proches de la
voiture (fenêtre autour de l'indice de sa projection).
"""

from __future__ import annotations

import numpy as np

from sim.track import Track

SENSOR_ANGLES = np.radians([-90.0, -60.0, -30.0, 0.0, 30.0, 60.0, 90.0])  # relatifs au cap psi
SENSOR_RANGE = 100.0  # portée des capteurs (m)
# Demi-fenêtre de segments examinés autour de la voiture. Un rayon qui reste dans
# la piste sur 100 m avance d'au plus 100 * R / (R - w/2) m le long de la ligne
# centrale, soit 100 * 15 / 9 ≈ 167 m au rayon minimal de 15 m : 34 segments de
# 5 m. On prend 40 par sécurité.
SENSOR_WINDOW = 40


def read_sensors(
    track: Track,
    x: float,
    y: float,
    psi: float,
    index: int | None = None,
    angles: np.ndarray = SENSOR_ANGLES,
    max_range: float = SENSOR_RANGE,
) -> np.ndarray:
    """Distance (m) from (x, y) to the nearest track border along each ray, capped at max_range.

    ``index`` is the centreline segment of the car (from ``Track.project``):
    when given, only the border segments within ``SENSOR_WINDOW`` of it are tested.
    """
    n = len(track.points)
    if index is not None and n > 2 * SENSOR_WINDOW + 1:
        near = track.window(index, SENSOR_WINDOW)
        segs = np.concatenate((near, near + n))  # bord gauche puis bord droit
        a, e = track.border_start[segs], track.border_vec[segs]
    else:
        a, e = track.border_start, track.border_vec  # A : début de chaque segment, E : son vecteur, (M, 2)
    theta = psi + angles
    r = np.stack((np.cos(theta), np.sin(theta)), axis=1)  # direction unitaire r de chaque rayon, (K, 2)
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
