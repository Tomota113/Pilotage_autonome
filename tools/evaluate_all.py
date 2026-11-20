"""Evaluate every finished run, and the classic driver, on train and test tracks × mu factors.

Usage : ``python -m tools.evaluate_all [--mu 1.0 0.8 0.6] [--out results/eval.csv]``

- runs pris en compte : ceux de ``runs/`` dont la configuration correspond à une
  condition de ``tools/make_configs.py`` (les essais courts sont ignorés) ; pour
  une même condition et une même graine, seul le run le plus récent compte ;
- checkpoint évalué : le dernier (plus grand nombre de pas) ;
- circuits : ceux d'entraînement et de test de la config, pour comparer train / test ;
- le pilote classique (run_id ``classic_ref``) roule sur les mêmes circuits et μ ;
- replays de démonstration : premier circuit de test, à chaque μ, avec les
  activations pour les réseaux ; les autres épisodes ne remplissent que eval.csv.

``results/eval.csv`` est entièrement régénéré (l'ancien est gardé en ``eval.csv.bak``).
"""

from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path

import yaml

from agents.evaluate import evaluate
from tools.make_configs import TEST_TRACKS, TRAIN_TRACKS, condition_of

ROOT = Path(__file__).resolve().parent.parent
MU_FACTORS = (1.0, 0.8, 0.6)
CLASSIC_RUN_ID = "classic_ref"


def last_checkpoint(run_dir: Path) -> Path | None:
    """Checkpoint with the largest step number (step_<N>.zip or .npy)."""
    ckpts = [p for p in (run_dir / "checkpoints").glob("step_*") if p.suffix in (".zip", ".npy")]
    if not ckpts:
        return None
    return max(ckpts, key=lambda p: int(re.search(r"step_(\d+)", p.stem).group(1)))


def find_runs(runs_dir: Path) -> list[tuple[str, int, Path]]:
    """(condition, seed, run directory) of the latest run of each condition and seed that has a checkpoint."""
    latest: dict[tuple[str, int], Path] = {}
    for config_path in sorted(runs_dir.glob("*/config.yaml")):  # run_id finit par la date : tri = ordre chronologique
        run_dir = config_path.parent
        if run_dir.name.startswith("_"):
            continue
        cfg = yaml.safe_load(config_path.read_text(encoding="utf-8"))
        condition = condition_of(cfg)
        if condition is not None and last_checkpoint(run_dir) is not None:
            latest[(condition, int(cfg["seed"]))] = run_dir
    return [(cond, seed, run_dir) for (cond, seed), run_dir in sorted(latest.items())]


def evaluate_all(runs_dir: Path, out: Path, mu_factors=MU_FACTORS,
                 train_tracks=TRAIN_TRACKS, test_tracks=TEST_TRACKS) -> int:
    """Evaluate the classic driver and every run found; return the number of eval.csv rows written."""
    if out.exists():
        shutil.copy(out, out.with_suffix(".csv.bak"))
        out.unlink()
    demo_track = test_tracks[0]
    others = [t for t in list(train_tracks) + list(test_tracks) if t != demo_track]

    agents = [("classic", "classic")] + [(str(last_checkpoint(run_dir)), f"{cond} s{seed}")
                                         for cond, seed, run_dir in find_runs(runs_dir)]
    n_rows = 0
    for agent, label in agents:
        run_id = CLASSIC_RUN_ID if agent == "classic" else None  # sinon : run_id lu dans le chemin du checkpoint
        print(f"{label} : {agent}", flush=True)
        # Replays de démonstration (avec activations), puis le reste sans replay
        rows = evaluate(agent, [demo_track], list(mu_factors), run_id=run_id, with_activations=True,
                        eval_csv=out, runs_dir=runs_dir)
        rows += evaluate(agent, others, list(mu_factors), run_id=run_id, save_replays=False,
                         eval_csv=out, runs_dir=runs_dir)
        laps = sum(r["outcome"] == "lap" for r in rows)
        print(f"  {laps}/{len(rows)} tours valides", flush=True)
        n_rows += len(rows)
    return n_rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--mu", nargs="+", type=float, default=list(MU_FACTORS))
    parser.add_argument("--runs-dir", type=Path, default=ROOT / "runs")
    parser.add_argument("--out", type=Path, default=ROOT / "results" / "eval.csv")
    args = parser.parse_args()
    n = evaluate_all(args.runs_dir, args.out, args.mu)
    print(f"{n} lignes écrites dans {args.out}")


if __name__ == "__main__":
    main()
