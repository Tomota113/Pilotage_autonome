"""Record the replays shown in the application: the best run of each condition on every test track.

Usage : ``python -m tools.make_showcase [--eval-csv results/eval_best.csv] [--mu 1.0 0.8 0.6]``

Pour chaque condition (et le pilote classique), on prend la graine qui a bouclé le plus de
tours dans l'évaluation des meilleurs checkpoints (``results/eval_best.csv``), et son
meilleur checkpoint (choisi sur l'entraînement, voir tools/evaluate_all.py). Il roule sur
chaque circuit de test × μ, avec les activations pour les réseaux. Les replays vont dans
``runs/<run_id>/replays/`` et les lignes d'évaluation dans ``results/eval_showcase.csv``
(fichier séparé : il ne remplace aucun résultat). Ce sont de vraies évaluations, rien
n'est inventé : seule la sélection des runs à montrer est faite ici.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from agents.evaluate import evaluate
from tools.evaluate_all import CLASSIC_RUN_ID, MU_FACTORS, best_checkpoint, find_runs
from tools.make_configs import TEST_TRACKS

ROOT = Path(__file__).resolve().parent.parent


def showcase_runs(runs_dir: Path, eval_csv: Path) -> list[tuple[str, Path]]:
    """(condition, run directory) of the seed with the most laps, for each condition."""
    laps = pd.read_csv(eval_csv).assign(lap=lambda d: d["outcome"] == "lap").groupby("run_id")["lap"].sum()
    best: dict[str, tuple[int, Path]] = {}
    for condition, _, run_dir in find_runs(runs_dir):
        n = int(laps.get(run_dir.name, 0))
        if condition not in best or n > best[condition][0]:
            best[condition] = (n, run_dir)
    return [(condition, run_dir) for condition, (_, run_dir) in best.items()]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--runs-dir", type=Path, default=ROOT / "runs")
    parser.add_argument("--eval-csv", type=Path, default=ROOT / "results" / "eval_best.csv")
    parser.add_argument("--out", type=Path, default=ROOT / "results" / "eval_showcase.csv")
    parser.add_argument("--mu", nargs="+", type=float, default=list(MU_FACTORS))
    args = parser.parse_args()
    if args.out.exists():
        args.out.unlink()  # régénéré entièrement

    agents = [("classic", "classic", CLASSIC_RUN_ID)]
    agents += [(condition, str(best_checkpoint(run_dir)), None) for condition, run_dir in
               showcase_runs(args.runs_dir, args.eval_csv)]
    for condition, agent, run_id in agents:
        rows = evaluate(agent, TEST_TRACKS, args.mu, run_id=run_id, with_activations=True,
                        eval_csv=args.out, runs_dir=args.runs_dir)
        laps = sum(r["outcome"] == "lap" for r in rows)
        print(f"{condition:22s} {Path(agent).parent.parent.name if run_id is None else run_id:40s} "
              f"{laps}/{len(rows)} tours", flush=True)


if __name__ == "__main__":
    main()
