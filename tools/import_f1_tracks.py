"""Convert the real F1 circuits of data/f1_tracks_tum/ into track.json files (tracks/f1_*.json).

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
from tools.generate_tracks import SPACING, resample_closed

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


def left_normals(points: np.ndarray) -> np.ndarray:
    """Unit normal to the left of the centred tangent at each point of a closed polyline."""
    tangent = np.roll(points, -1, axis=0) - np.roll(points, 1, axis=0)
    tangent /= np.hypot(tangent[:, 0], tangent[:, 1])[:, None]
    return np.stack((-tangent[:, 1], tangent[:, 0]), axis=1)


def convert(csv_path: Path, track_id: str, name: str) -> dict:
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
        "split": "test",  # jamais vus pendant l'entraînement
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


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for stem, (track_id, name) in CIRCUITS.items():
        data = convert(RAW / f"{stem}.csv", track_id, name)
        path = OUT / f"{track_id}.json"
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        w = np.array(data["width"])
        print(f"{path.name:22s} {data['length']:7.1f} m  {len(data['centerline'])} points  largeur {w.min():.1f}–{w.max():.1f} m")


if __name__ == "__main__":
    main()
