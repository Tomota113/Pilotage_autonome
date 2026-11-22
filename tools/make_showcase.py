"""Record the replays shown in the application: the best run of each condition on every test track.

Usage : ``python -m tools.make_showcase [--eval-csv results/eval_best.csv] [--mu 1.0 0.8 0.6]``

Pour chaque condition (et les pilotes classique et trajectoire idéale), on prend la graine qui a bouclé le plus de
tours dans l'évaluation des meilleurs checkpoints (``results/eval_best.csv``), et son
meilleur checkpoint (choisi sur l'entraînement, voir tools/evaluate_all.py). Il roule sur
chaque circuit de test × μ, avec les activations pour les réseaux. Les replays vont dans
``runs/<run_id>/replays/`` et les lignes d'évaluation dans ``results/eval_showcase.csv``
(fichier séparé : il ne remplace aucun résultat). Ce sont de vraies évaluations, rien
n'est inventé : seule la sélection des runs à montrer est faite ici.

``--series v2`` (voiture F1) : graine qui a bouclé le plus de tours sur les circuits F1
(``results/eval_f1_v2.csv``), évaluée sur les 17 circuits réels d'entraînement et les 6 circuits
générés à l'échelle F1 (gen_f1_*), μ = 1,0 ; lignes dans ``results/eval_showcase_v2.csv``.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from agents.evaluate import evaluate
from tools.evaluate_all import MU_FACTORS, REFERENCE_RUN_IDS, best_checkpoint, find_runs
from tools.generate_tracks import F1_SEEDS
from tools.make_configs import CONDITIONS, F1_CONDITIONS, REAL_TRAIN_TRACKS, TEST_TRACKS

ROOT = Path(__file__).resolve().parent.parent


F1_REFERENCE_RUN_IDS = {"classic": "classic_f1_ref", "raceline": "raceline_f1_ref"}
F1_SHOWCASE_TRACKS = REAL_TRAIN_TRACKS + [f"gen_f1_{seed:02d}" for seed in F1_SEEDS]
MAX_STEPS = 6000


def showcase_runs(runs_dir: Path, eval_csv: Path, conditions=CONDITIONS) -> list[tuple[str, Path]]:
    """(condition, run directory) of the seed with the most laps, for each condition."""
    laps = pd.read_csv(eval_csv).assign(lap=lambda d: d["outcome"] == "lap").groupby("run_id")["lap"].sum()
    best: dict[str, tuple[int, Path]] = {}
    for condition, _, run_dir in find_runs(runs_dir, conditions):
        n = int(laps.get(run_dir.name, 0))
        if condition not in best or n > best[condition][0]:
            best[condition] = (n, run_dir)
    return [(condition, run_dir) for condition, (_, run_dir) in best.items()]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--series", choices=("v1", "v2"), default="v1")
    parser.add_argument("--runs-dir", type=Path, default=ROOT / "runs")
    parser.add_argument("--eval-csv", type=Path, help="default: results/eval_best.csv (v1), eval_f1_v2.csv (v2)")
    parser.add_argument("--out", type=Path, help="default: results/eval_showcase.csv (v1), eval_showcase_v2.csv (v2)")
    parser.add_argument("--mu", nargs="+", type=float, help="default: 1.0 0.8 0.6 (v1), 1.0 (v2)")
    args = parser.parse_args()
    v2 = args.series == "v2"
    eval_csv = args.eval_csv or ROOT / "results" / ("eval_f1_v2.csv" if v2 else "eval_best.csv")
    out = args.out or ROOT / "results" / ("eval_showcase_v2.csv" if v2 else "eval_showcase.csv")
    mus = args.mu or ([1.0] if v2 else list(MU_FACTORS))
    tracks = F1_SHOWCASE_TRACKS if v2 else TEST_TRACKS
    if out.exists():
        out.unlink()  # régénéré entièrement

    refs = F1_REFERENCE_RUN_IDS if v2 else REFERENCE_RUN_IDS
    agents = [(name, name, run_id) for name, run_id in refs.items()]
    agents += [(condition, str(best_checkpoint(run_dir)), None) for condition, run_dir in
               showcase_runs(args.runs_dir, eval_csv, F1_CONDITIONS if v2 else CONDITIONS)]
    for condition, agent, run_id in agents:
        rows = evaluate(agent, tracks, mus, run_id=run_id, with_activations=True, eval_csv=out,
                        runs_dir=args.runs_dir, max_steps=MAX_STEPS if v2 else None,
                        car="f1_2024" if v2 and run_id else None)
        laps = sum(r["outcome"] == "lap" for r in rows)
        print(f"{condition:22s} {Path(agent).parent.parent.name if run_id is None else run_id:40s} "
              f"{laps}/{len(rows)} tours", flush=True)


if __name__ == "__main__":
    main()
