"""Convert TUM circuits into test (f1_*.json) and training (real_*.json) tracks.

Usage : ``python -m tools.import_f1_tracks``

Source : TUM racetrack-database (LGPL-3.0), voir data/f1_tracks_tum/SOURCE.md. Chaque CSV
donne la ligne centrale et les largeurs à droite et à gauche, qui peuvent différer. Notre
format n'a qu'une largeur par point, centrée : on déplace donc chaque point vers le milieu
réel de la piste (de (w_gauche − w_droite) / 2 le long de la normale), puis on
rééchantillonne tous les 5 m. Le sens de parcours et le point de départ sont ceux du fichier.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from sim.track import N_CHECKPOINTS, SCHEMA, Track
from tools.generate_tracks import SPACING, max_curvature, min_gap, resample_closed

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "f1_tracks_tum"
OUT = ROOT / "tracks"

# fichier -> (id, nom affiché)
CIRCUITS = {
    "Monza": ("f1_monza", "Monza (Italie)"),
    "Spa": ("f1_spa", "Spa-Francorchamps (Belgique)"),
    "Silverstone": ("f1_silverstone", "Silverstone (Royaume-Uni)"),
    "Suzuka": ("f1_suzuka", "Suzuka (Japon)"),
    "Budapest": ("f1_budapest", "Hungaroring (Hongrie)"),
    "Catalunya": ("f1_catalunya", "Barcelone-Catalogne (Espagne)"),
    "Spielberg": ("f1_spielberg", "Red Bull Ring (Autriche)"),
    "Zandvoort": ("f1_zandvoort", "Zandvoort (Pays-Bas)"),
}

TRAIN_CIRCUITS = {
    "Austin": ("real_austin", "Circuit des Amériques, Austin (États-Unis)"),
    "BrandsHatch": ("real_brands_hatch", "Brands Hatch (Royaume-Uni)"),
    "Hockenheim": ("real_hockenheim", "Hockenheimring (Allemagne)"),
    "IMS": ("real_indianapolis", "Indianapolis Motor Speedway (États-Unis)"),
    "Melbourne": ("real_melbourne", "Albert Park, Melbourne (Australie)"),
    "MexicoCity": ("real_mexico", "Autodrome Hermanos Rodríguez, Mexico (Mexique)"),
    "Montreal": ("real_montreal", "Circuit Gilles-Villeneuve, Montréal (Canada)"),
    "MoscowRaceway": ("real_moscow", "Moscow Raceway (Russie)"),
    "Norisring": ("real_norisring", "Norisring, Nuremberg (Allemagne)"),
    "Nuerburgring": ("real_nurburgring", "Nürburgring (Allemagne)"),
    "Oschersleben": ("real_oschersleben", "Circuit d’Oschersleben (Allemagne)"),
    "Sakhir": ("real_sakhir", "Circuit international de Bahreïn, Sakhir (Bahreïn)"),
    "SaoPaulo": ("real_interlagos", "Interlagos, São Paulo (Brésil)"),
    "Sepang": ("real_sepang", "Circuit international de Sepang (Malaisie)"),
    "Shanghai": ("real_shanghai", "Circuit international de Shanghai (Chine)"),
    "Sochi": ("real_sochi", "Autodrome de Sotchi (Russie)"),
    "YasMarina": ("real_yas_marina", "Circuit Yas Marina, Abou Dabi (Émirats arabes unis)"),
}


def left_normals(points: np.ndarray) -> np.ndarray:
    """Unit normal to the left of the centred tangent at each point of a closed polyline."""
    tangent = np.roll(points, -1, axis=0) - np.roll(points, 1, axis=0)
    tangent /= np.hypot(tangent[:, 0], tangent[:, 1])[:, None]
    return np.stack((-tangent[:, 1], tangent[:, 0]), axis=1)


def convert(csv_path: Path, track_id: str, name: str, split: str) -> dict:
    raw = np.loadtxt(csv_path, delimiter=",", comments="#")
    xy, w_right, w_left = raw[:, :2], raw[:, 2], raw[:, 3]
    if np.hypot(*(xy[0] - xy[-1])) < 1e-6:  # boucle explicitement fermée : on retire le doublon
        xy, w_right, w_left = xy[:-1], w_right[:-1], w_left[:-1]
    # Milieu réel de la piste et largeur totale
    centre = xy + left_normals(xy) * ((w_left - w_right) / 2.0)[:, None]
    width = w_left + w_right
    # Rééchantillonnage à 5 m ; la largeur suit, interpolée selon l'abscisse curviligne
    closed = np.vstack((centre, centre[:1]))
    s = np.concatenate(([0.0], np.cumsum(np.hypot(*np.diff(closed, axis=0).T))))
    points = resample_closed(centre, SPACING)
    s_new = np.arange(len(points)) * (s[-1] / len(points))
    width_new = np.interp(s_new, s, np.append(width, width[0]))

    points = np.round(points, 3)
    n = len(points)
    seg = np.roll(points, -1, axis=0) - points
    data = {
        "schema": SCHEMA,
        "id": track_id,
        "name": name,
        "split": split,
        "seed": None,
        "centerline": points.tolist(),
        "width": np.round(width_new, 2).tolist(),
        "mu": [1.0] * n,
        "start": {"index": 0, "heading": round(float(math.atan2(seg[0, 1], seg[0, 0])), 6)},
        "checkpoints": [k * n // N_CHECKPOINTS for k in range(N_CHECKPOINTS)],
        "length": round(float(np.hypot(seg[:, 0], seg[:, 1]).sum()), 1),
    }
    Track(data)  # validation du contrat
    return data


def has_self_intersection(points: np.ndarray) -> bool:
    """Check for intersections between non-adjacent centreline segments."""
    ends = np.roll(points, -1, axis=0)
    lower = np.minimum(points, ends)
    upper = np.maximum(points, ends)
    first, second = np.triu_indices(len(points), k=2)
    # Écarter les voisins à la fermeture de la boucle et les boîtes disjointes.
    candidates = (second - first < len(points) - 1) & np.all(
        (lower[first] <= upper[second]) & (lower[second] <= upper[first]), axis=1
    )
    first, second = first[candidates], second[candidates]

    segments = ends - points
    normals = np.stack((-segments[:, 1], segments[:, 0]), axis=1)

    def straddles(line: np.ndarray, other: np.ndarray) -> np.ndarray:
        start_side = np.sum(normals[line] * (points[other] - points[line]), axis=1)
        end_side = np.sum(normals[line] * (ends[other] - points[line]), axis=1)
        return start_side * end_side <= 0

    return bool(np.any(straddles(first, second) & straddles(second, first)))


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for split, circuits in (("test", CIRCUITS), ("train", TRAIN_CIRCUITS)):
        for stem, (track_id, name) in circuits.items():
            data = convert(RAW / f"{stem}.csv", track_id, name, split)
            path = OUT / f"{track_id}.json"
            path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

            points = np.asarray(data["centerline"])
            width = np.asarray(data["width"])
            radius = 1.0 / max_curvature(points)
            gap = min_gap(points)
            crossing = "  ATTENTION : croisement de la ligne centrale" if has_self_intersection(points) else ""
            print(
                f"{path.name:23s} {split:5s}  {data['length']:7.1f} m  {len(points):4d} points  "
                f"largeur {width.min():.2f}–{width.max():.2f} m  rayon min {radius:.2f} m  "
                f"écart min {gap:.2f} m{crossing}"
            )


if __name__ == "__main__":
    main()
