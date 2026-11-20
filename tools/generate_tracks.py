"""Generate the circuits of the project as ``track.json`` files (schema f1rl.track/1.0).

Usage : ``python -m tools.generate_tracks [--out tracks]``

Chaque circuit aléatoire est une courbe polaire fermée
    r(theta) = R0 + somme_k a_k sin(k theta + phi_k),
tirée à partir d'une graine, lissée puis rééchantillonnée tous les 5 m. Une
courbe polaire avec r > 0 ne se recoupe jamais elle-même ; on rejette en plus
(et on retire) les circuits trop courts ou trop longs, trop serrés
(rayon < 15 m) ou dont deux portions éloignées sont si proches que leurs
bords se toucheraient.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np

from sim.track import N_CHECKPOINTS, SCHEMA, Track

SPACING = 5.0  # espacement des points de la ligne centrale (m)
WIDTH = 12.0  # largeur de piste (m)
LENGTH_RANGE = (1500.0, 3000.0)  # longueur admise (m)
MIN_RADIUS = 15.0  # rayon de courbure minimal (m)
MIN_GAP = 2.0 * WIDTH  # distance minimale entre deux portions éloignées de la ligne centrale (m)
HARMONICS = range(2, 11)  # k = 2..10 dans r(theta)
AMPLITUDE = 0.8  # a_k tiré dans [0, AMPLITUDE * R0 / k]
MAX_ATTEMPTS = 1000
TRAIN_SEEDS = range(0, 10)  # gen_00 .. gen_09
TEST_SEEDS = range(10, 15)  # gen_10 .. gen_14


def resample_closed(points: np.ndarray, spacing: float = SPACING) -> np.ndarray:
    """Resample a closed polyline at (almost) constant arc-length spacing."""
    closed = np.vstack((points, points[:1]))
    seg = np.hypot(*np.diff(closed, axis=0).T)
    s = np.concatenate(([0.0], np.cumsum(seg)))
    n = max(int(round(s[-1] / spacing)), 3)
    s_new = np.arange(n) * (s[-1] / n)
    return np.stack((np.interp(s_new, s, closed[:, 0]), np.interp(s_new, s, closed[:, 1])), axis=1)


def smooth_closed(points: np.ndarray, size: int = 5) -> np.ndarray:
    """Circular moving average of the points of a closed polyline."""
    half = size // 2
    padded = np.vstack((points[-half:], points, points[:half]))
    kernel = np.ones(size) / size
    return np.stack([np.convolve(padded[:, c], kernel, mode="valid") for c in range(2)], axis=1)


def polar_centerline(rng: np.random.Generator) -> np.ndarray:
    """Random closed polar curve r(theta) = R0 + sum_k a_k sin(k theta + phi_k), counter-clockwise."""
    r0 = rng.uniform(230.0, 450.0)
    theta = np.linspace(0.0, 2.0 * math.pi, 4000, endpoint=False)
    r = np.full_like(theta, r0)
    for k in HARMONICS:
        a_k = rng.uniform(0.0, AMPLITUDE * r0 / k)  # amplitudes décroissantes avec k
        r += a_k * np.sin(k * theta + rng.uniform(0.0, 2.0 * math.pi))
    if np.any(r < 0.2 * r0):
        return np.empty((0, 2))
    return np.stack((r * np.cos(theta), r * np.sin(theta)), axis=1)


def max_curvature(points: np.ndarray) -> float:
    """Largest |curvature| (1/m) of a closed polyline (turning angle / mean segment length)."""
    seg = np.roll(points, -1, axis=0) - points
    heading = np.arctan2(seg[:, 1], seg[:, 0])
    turn = np.angle(np.exp(1j * (heading - np.roll(heading, 1))))
    length = np.hypot(seg[:, 0], seg[:, 1])
    return float(np.max(np.abs(turn) / (0.5 * (length + np.roll(length, 1)))))


def min_gap(points: np.ndarray, spacing: float = SPACING) -> float:
    """Smallest distance between two points that are far apart along the loop (> 3 * MIN_GAP of arc)."""
    n = len(points)
    diff = points[:, None, :] - points[None, :, :]
    dist = np.hypot(diff[..., 0], diff[..., 1])
    k = np.arange(n)
    arc = np.abs(k[:, None] - k[None, :])
    arc = np.minimum(arc, n - arc) * spacing  # distance le long de la boucle
    far = arc > 3.0 * MIN_GAP
    return float(dist[far].min()) if far.any() else math.inf


def is_acceptable(points: np.ndarray) -> bool:
    if len(points) < 50:
        return False
    length = float(np.hypot(*(np.roll(points, -1, axis=0) - points).T).sum())
    return (
        LENGTH_RANGE[0] <= length <= LENGTH_RANGE[1]
        and max_curvature(points) <= 1.0 / MIN_RADIUS
        and min_gap(points) >= MIN_GAP
    )


def track_dict(points: np.ndarray, track_id: str, name: str, split: str, seed: int | None) -> dict:
    """Build a contract-compliant track dictionary from a closed centreline."""
    points = np.round(points, 3)
    n = len(points)
    seg = np.roll(points, -1, axis=0) - points
    return {
        "schema": SCHEMA,
        "id": track_id,
        "name": name,
        "split": split,
        "seed": seed,
        "centerline": points.tolist(),
        "width": [WIDTH] * n,
        "mu": [1.0] * n,
        "start": {"index": 0, "heading": round(float(math.atan2(seg[0, 1], seg[0, 0])), 6)},
        "checkpoints": [k * n // N_CHECKPOINTS for k in range(N_CHECKPOINTS)],
        "length": round(float(np.hypot(seg[:, 0], seg[:, 1]).sum()), 1),
    }


def generate_track(seed: int, split: str) -> dict:
    """Random circuit ``gen_<seed>``: same seed, same circuit."""
    rng = np.random.default_rng(seed)
    for _ in range(MAX_ATTEMPTS):
        raw = polar_centerline(rng)
        if len(raw) == 0:
            continue
        points = smooth_closed(resample_closed(raw))
        points = resample_closed(points)  # le lissage modifie un peu les espacements
        if is_acceptable(points):
            data = track_dict(points, f"gen_{seed:02d}", f"Générée {seed:02d}", split, seed)
            Track(data)  # dernière vérification : le chargement valide le contrat
            return data
    raise RuntimeError(f"no acceptable circuit found for seed {seed} after {MAX_ATTEMPTS} attempts")


def demo_oval(straight: float = 300.0, radius: float = 60.0) -> dict:
    """Simple stadium: two straights joined by two half-circles, counter-clockwise, start on the bottom straight."""
    half = straight / 2.0
    a = np.linspace(0.0, math.pi, 200, endpoint=False)  # angle parcouru dans chaque demi-cercle
    pieces = [
        np.stack((np.linspace(-half, half, 200, endpoint=False), np.full(200, -radius)), axis=1),
        np.stack((half + radius * np.sin(a), -radius * np.cos(a)), axis=1),
        np.stack((np.linspace(half, -half, 200, endpoint=False), np.full(200, radius)), axis=1),
        np.stack((-half - radius * np.sin(a), radius * np.cos(a)), axis=1),
    ]
    points = resample_closed(np.vstack(pieces))
    return track_dict(points, "demo_oval", "Ovale de démonstration", "demo", None)


def generate_all() -> list[dict]:
    tracks = [generate_track(seed, "train") for seed in TRAIN_SEEDS]
    tracks += [generate_track(seed, "test") for seed in TEST_SEEDS]
    tracks.append(demo_oval())
    return tracks


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default="tracks", help="output directory (default: tracks)")
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for data in generate_all():
        path = out / f"{data['id']}.json"
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        print(f"{path}  {data['split']:5s}  {data['length']:7.1f} m  {len(data['centerline'])} points")


if __name__ == "__main__":
    main()
