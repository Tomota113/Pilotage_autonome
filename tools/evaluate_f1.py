"""Evaluate every agent on the real F1 circuits (never seen during training).

Usage : ``python -m tools.evaluate_f1 [--mu 1.0 0.8 0.6] [--out results/eval_f1.csv]``

- circuits : les 8 circuits F1 importés par tools/import_f1_tracks.py ;
- agents : pilote classique, pilote trajectoire idéale, et les 24 runs (meilleur checkpoint,
  choisi sur l'entraînement comme dans tools/evaluate_all.py) ;
- épisodes de 6 000 pas maximum (300 s) : un tour de Spa dure plus que les 3 000 pas de
  l'entraînement ; les agents ne perçoivent pas le temps, leur comportement n'en dépend pas ;
- replays : pilotes de référence et meilleure graine de chaque condition (voir
  tools/make_showcase.py), sans les activations (fichiers trop gros sur des tours de 3 000 pas).
"""

from __future__ import annotations

import argparse
from pathlib import Path

from agents.evaluate import evaluate
from tools.evaluate_all import MU_FACTORS, REFERENCE_RUN_IDS, best_checkpoint, find_runs
from tools.import_f1_tracks import CIRCUITS
from tools.make_showcase import showcase_runs

ROOT = Path(__file__).resolve().parent.parent
F1_TRACKS = [track_id for track_id, _ in CIRCUITS.values()]
MAX_STEPS = 6000


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--runs-dir", type=Path, default=ROOT / "runs")
    parser.add_argument("--best-eval", type=Path, default=ROOT / "results" / "eval_best.csv")
    parser.add_argument("--out", type=Path, default=ROOT / "results" / "eval_f1.csv")
    parser.add_argument("--mu", nargs="+", type=float, default=list(MU_FACTORS))
    args = parser.parse_args()
    if args.out.exists():
        args.out.unlink()  # régénéré entièrement

    shown = {run_dir for _, run_dir in showcase_runs(args.runs_dir, args.best_eval)}
    agents = [(name, run_id, True) for name, run_id in REFERENCE_RUN_IDS.items()]
    agents += [(str(best_checkpoint(run_dir)), None, run_dir in shown) for _, _, run_dir in find_runs(args.runs_dir)]
    for agent, run_id, save in agents:
        rows = evaluate(agent, F1_TRACKS, args.mu, run_id=run_id, save_replays=save, eval_csv=args.out,
                        runs_dir=args.runs_dir, max_steps=MAX_STEPS)
        laps = sum(r["outcome"] == "lap" for r in rows)
        label = run_id or Path(agent).parent.parent.name
        print(f"{label:42s} {laps:2d}/{len(rows)} tours{'  (replays)' if save else ''}", flush=True)


if __name__ == "__main__":
    main()
