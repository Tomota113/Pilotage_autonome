"""Evaluate the reference drivers and the best trained agent per condition on one track."""

from __future__ import annotations

import argparse
import fcntl
import math
import os
import re
import shutil
import tempfile
from functools import partial
from pathlib import Path
from unittest.mock import patch

from agents import evaluate as evaluation
from env.f1_env import load_tracks
from tools.evaluate_all import REFERENCE_RUN_IDS, ROOT, best_checkpoint, find_runs
from tools.evaluate_f1 import F1_REFERENCES, MAX_STEPS, best_seed_by_training
from tools.make_configs import CONDITIONS, F1_CONDITIONS

TRACK_ID = re.compile(r"[a-z0-9_]{1,128}")
SERIES = {"v1": (CONDITIONS, REFERENCE_RUN_IDS), "f1_2024": (F1_CONDITIONS, F1_REFERENCES)}


def validate_race_options(car, mu_factors) -> None:
    if not isinstance(car, str) or car not in SERIES:
        raise ValueError("Voiture inconnue. Choisissez v1 ou f1_2024.")
    if not isinstance(mu_factors, (list, tuple)) or not mu_factors:
        raise ValueError("Indiquez au moins un facteur d’adhérence.")
    for factor in mu_factors:
        # Le nom d’un replay représente le facteur avec deux décimales.
        if (type(factor) not in (int, float) or not math.isfinite(factor) or factor <= 0
                or round(factor, 2) != factor):
            raise ValueError("Les facteurs d’adhérence doivent être positifs et avoir au plus deux décimales.")
    if len(set(mu_factors)) != len(mu_factors):
        raise ValueError("Les facteurs d’adhérence doivent être distincts.")


def race_on_track(track_id: str, car: str, mu_factors=(1.0,), runs_dir: Path = ROOT / "runs",
                  eval_csv: Path = ROOT / "results" / "eval_custom.csv") -> int:
    """Write replays and evaluation rows, returning the number of replays produced."""
    validate_race_options(car, mu_factors)
    if not TRACK_ID.fullmatch(track_id):
        raise ValueError("Identifiant de circuit invalide.")

    runs_dir = Path(runs_dir).resolve()
    eval_csv = Path(eval_csv)
    tracks_dir = runs_dir.parent / "tracks"
    track_path = tracks_dir / f"{track_id}.json"
    if track_path.resolve() != track_path or not track_path.is_file():
        raise ValueError(f"Circuit introuvable : {track_id}.")

    conditions, references = SERIES[car]
    selected = best_seed_by_training(find_runs(runs_dir, conditions))
    entrants = list(references.items())
    for run_dir in sorted(selected):
        checkpoint = best_checkpoint(run_dir)
        if checkpoint is None:
            raise ValueError(f"Checkpoint introuvable : {run_dir.name}.")
        entrants.append((str(checkpoint), run_dir.name))

    runs_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="_custom_race_", dir=runs_dir) as directory:
        staged_runs = Path(directory) / runs_dir.name
        staged_csv = Path(directory) / "eval.csv"
        # L’évaluateur utilise le dossier du dépôt par défaut. Rediriger son chargeur
        # pour cette course permet aussi au processus serveur de respecter F1RL_ROOT.
        with patch.object(evaluation, "load_tracks", partial(load_tracks, directory=tracks_dir)):
            for agent, run_id in entrants:
                evaluation.evaluate(agent, [track_id], list(mu_factors), run_id=run_id, car=car,
                                    runs_dir=staged_runs, eval_csv=staged_csv, max_steps=MAX_STEPS)

        # Publier les replays complets sous leurs run_id habituels, pour GET /replays.
        replays = list(staged_runs.glob("*/replays/*.json"))
        destinations = [runs_dir / path.relative_to(staged_runs) for path in replays]
        if any(path.resolve() != path for path in destinations) or eval_csv.is_symlink():
            raise ValueError("Destination d’évaluation invalide.")
        eval_csv.parent.mkdir(parents=True, exist_ok=True)
        with staged_csv.open("rb") as source, eval_csv.open("ab") as target:
            # Plusieurs circuits peuvent partager le CSV. L’en-tête et les lignes
            # d’une course sont écrits sous le même verrou.
            fcntl.flock(target, fcntl.LOCK_EX)
            for path, destination in zip(replays, destinations):
                destination.parent.mkdir(parents=True, exist_ok=True)
                path.replace(destination)
            if os.fstat(target.fileno()).st_size:
                source.readline()
            shutil.copyfileobj(source, target)
        return len(replays)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("track_id")
    parser.add_argument("--car", choices=SERIES, default="f1_2024")
    parser.add_argument("--mu", nargs="+", type=float, default=[1.0])
    parser.add_argument("--runs-dir", type=Path, default=ROOT / "runs")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    out = args.out or args.runs_dir.parent / "results" / "eval_custom.csv"
    try:
        count = race_on_track(args.track_id, args.car, args.mu, args.runs_dir, out)
    except (OSError, ValueError, OverflowError) as exc:
        parser.exit(1, f"{exc}\n")
    # Le serveur lit le nombre de replays sur la dernière ligne de stdout.
    print(count)


if __name__ == "__main__":
    main()
