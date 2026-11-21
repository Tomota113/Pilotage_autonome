"""Evaluate every finished run, and the classic driver, on train and test tracks × mu factors.

Usage : ``python -m tools.evaluate_all [--checkpoint last|best] [--mu 1.0 0.8 0.6] [--out ...]``

- runs pris en compte : ceux de ``runs/`` dont la configuration correspond à une
  condition de ``tools/make_configs.py`` (les essais courts sont ignorés) ; pour
  une même condition et une même graine, seul le run le plus récent compte ;
- checkpoint évalué : le dernier (``last``, par défaut, résultats dans ``results/eval.csv``) ou
  le meilleur (``best``, résultats dans ``results/eval_best.csv``). Le meilleur est choisi
  d'après les évaluations faites PENDANT l'entraînement (progress.csv, circuits
  d'entraînement) : plus grand taux de tours, puis plus grande récompense, puis le plus
  récent. Les circuits de test ne servent donc pas au choix. Les méthodes tabulaires ne
  sauvegardent que leur table finale : pour elles, meilleur = dernier ;
- circuits : ceux d'entraînement et de test de la config, pour comparer train / test ;
- le pilote classique (``classic_ref``) et le pilote trajectoire idéale (``raceline_ref``)
  roulent sur les mêmes circuits et μ ;
- replays de démonstration : premier circuit de test, à chaque μ, avec les
  activations pour les réseaux ; les autres épisodes ne remplissent que eval.csv.

Le fichier de sortie est entièrement régénéré (l'ancien est gardé en ``.csv.bak``).
"""

from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path

import yaml

from agents.evaluate import evaluate
from tools.make_configs import CONDITIONS, TEST_TRACKS, TRAIN_TRACKS, condition_of

ROOT = Path(__file__).resolve().parent.parent
MU_FACTORS = (1.0, 0.8, 0.6)
CLASSIC_RUN_ID = "classic_ref"
RACELINE_RUN_ID = "raceline_ref"
REFERENCE_RUN_IDS = {"classic": CLASSIC_RUN_ID, "raceline": RACELINE_RUN_ID}  # pilotes sans apprentissage


def last_checkpoint(run_dir: Path) -> Path | None:
    """Checkpoint with the largest step number (step_<N>.zip, .npy or .pt)."""
    ckpts = [p for p in (run_dir / "checkpoints").glob("step_*") if p.suffix in (".zip", ".npy", ".pt")]
    if not ckpts:
        return None
    return max(ckpts, key=lambda p: int(re.search(r"step_(\d+)", p.stem).group(1)))


def best_checkpoint(run_dir: Path) -> Path | None:
    """Checkpoint of the best training-time evaluation (lap rate, then reward, then latest), if saved."""
    import pandas as pd

    progress = run_dir / "progress.csv"
    if progress.exists():
        df = pd.read_csv(progress)
        for _, row in df.sort_values(["lap_rate", "mean_reward", "step"], ascending=False).iterrows():
            for suffix in (".zip", ".npy", ".pt"):
                path = run_dir / "checkpoints" / f"step_{int(row['step'])}{suffix}"
                if path.exists():
                    return path
    return last_checkpoint(run_dir)


def find_runs(runs_dir: Path, conditions=None) -> list[tuple[str, int, Path]]:
    """(condition, seed, run directory) of the latest run of each condition and seed that has a checkpoint."""
    latest: dict[tuple[str, int], Path] = {}
    for config_path in sorted(runs_dir.glob("*/config.yaml")):  # run_id finit par la date : tri = ordre chronologique
        run_dir = config_path.parent
        if run_dir.name.startswith("_"):
            continue
        cfg = yaml.safe_load(config_path.read_text(encoding="utf-8"))
        condition = condition_of(cfg)
        if conditions is not None and condition not in conditions:
            continue
        if condition is not None and last_checkpoint(run_dir) is not None:
            latest[(condition, int(cfg["seed"]))] = run_dir
    return [(cond, seed, run_dir) for (cond, seed), run_dir in sorted(latest.items())]


def evaluate_all(runs_dir: Path, out: Path, mu_factors=MU_FACTORS,
                 train_tracks=TRAIN_TRACKS, test_tracks=TEST_TRACKS, checkpoint: str = "last") -> int:
    """Evaluate the classic driver and every run found; return the number of eval.csv rows written."""
    if out.exists():
        shutil.copy(out, out.with_suffix(".csv.bak"))
        out.unlink()
    demo_track = test_tracks[0]
    others = [t for t in list(train_tracks) + list(test_tracks) if t != demo_track]

    choose = {"last": last_checkpoint, "best": best_checkpoint}[checkpoint]
    agents = [("classic", "classic"), ("raceline", "raceline")]
    agents += [(str(choose(run_dir)), f"{cond} s{seed}") for cond, seed, run_dir in find_runs(runs_dir, CONDITIONS)]
    n_rows = 0
    for agent, label in agents:
        run_id = REFERENCE_RUN_IDS.get(agent)  # sinon : run_id lu dans le chemin du checkpoint
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
    parser.add_argument("--checkpoint", choices=("last", "best"), default="last")
    parser.add_argument("--out", type=Path, help="default: results/eval.csv (last) or results/eval_best.csv (best)")
    args = parser.parse_args()
    out = args.out or ROOT / "results" / ("eval.csv" if args.checkpoint == "last" else "eval_best.csv")
    n = evaluate_all(args.runs_dir, out, args.mu, checkpoint=args.checkpoint)
    print(f"{n} lignes écrites dans {out}")


if __name__ == "__main__":
    main()
