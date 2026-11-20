"""Draw the result figures from real files only: runs/*/progress.csv and results/eval.csv.

Usage : ``python -m tools.plots [--out results/figures]``

Figures (PNG) :
- ``learning_reward.png`` / ``learning_laps.png`` : courbes d'apprentissage, moyenne ± écart-type
  entre graines, par condition (récompense et taux de tours, deux figures : jamais deux axes y) ;
- ``laps_test_mu1.png`` / ``lap_time_test_mu1.png`` : taux de tours et temps au tour sur les
  circuits de test à μ = 1,0, par condition, avec le pilote classique en référence ;
- ``robustness_mu.png`` / ``robustness_lap_time.png`` : taux de tours et temps au tour (tours valides)
  sur les circuits de test selon le facteur μ ;
- ``train_vs_test.png`` : taux de tours à μ = 1,0 sur les circuits d'entraînement et de test.

Seuls les runs retenus par ``tools/evaluate_all.find_runs`` (une condition de
``tools/make_configs.py``, le plus récent par graine) sont tracés. Chaque figure
indique sa source et le nombre de graines. Sans données, la figure n'est pas produite.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # pas de fenêtre : fichiers PNG seulement
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

from tools.evaluate_all import CLASSIC_RUN_ID, find_runs  # noqa: E402
from tools.make_configs import CONDITIONS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

# Couleur et marqueur fixes par condition (la couleur suit la condition, jamais son rang).
# Palette catégorielle validée pour le daltonisme ; marqueurs = second codage.
STYLE = {
    "ppo_mufixe": ("#2a78d6", "o"),
    "ppo_mualea": ("#eb6834", "s"),
    "dqn_mufixe": ("#1baf7a", "^"),
    "sac_mufixe": ("#eda100", "D"),
    "qlearning_mufixe": ("#e87ba4", "v"),
    "ppo_mufixe_nolambda": ("#008300", "P"),
}
CLASSIC_COLOR = "#52514e"  # gris : référence, pas une série comparée
INK, MUTED, GRID = "#0b0b0b", "#52514e", "#e4e3df"


def _setup(title: str, xlabel: str, ylabel: str, source: str):
    fig, ax = plt.subplots(figsize=(8, 4.8), dpi=130)
    fig.patch.set_facecolor("#fcfcfb")
    ax.set_facecolor("#fcfcfb")
    ax.set_title(title, loc="left", fontsize=12, color=INK)
    ax.set_xlabel(xlabel, color=MUTED)
    ax.set_ylabel(ylabel, color=MUTED)
    ax.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.tick_params(colors=MUTED)
    fig.text(0.01, 0.01, f"Source : {source}", fontsize=7, color=MUTED)
    return fig, ax


def _save(fig, out: Path, name: str, written: list[Path]) -> None:
    out.mkdir(parents=True, exist_ok=True)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    fig.savefig(out / name)
    plt.close(fig)
    written.append(out / name)


def load_progress(runs_dir: Path) -> pd.DataFrame:
    frames = []
    for condition, seed, run_dir in find_runs(runs_dir):
        path = run_dir / "progress.csv"
        if path.exists():
            df = pd.read_csv(path)
            if not df.empty:
                frames.append(df.assign(condition=condition, seed=seed))
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def load_eval(runs_dir: Path, eval_csv: Path) -> pd.DataFrame:
    if not eval_csv.exists():
        return pd.DataFrame()
    df = pd.read_csv(eval_csv)
    conditions = {run_dir.name: condition for condition, _, run_dir in find_runs(runs_dir)}
    conditions[CLASSIC_RUN_ID] = "classic"
    df["condition"] = df["run_id"].map(conditions)
    df = df[df["condition"].notna()].copy()
    df["lap"] = (df["outcome"] == "lap").astype(float)
    return df


def _seeds(n: int) -> str:
    return f"{n} graine{'s' if n > 1 else ''}"


def _ordered(conditions) -> list[str]:
    return [c for c in CONDITIONS if c in set(conditions)]


def plot_learning(progress: pd.DataFrame, out: Path, written: list[Path]) -> None:
    for column, name, ylabel in (("mean_reward", "learning_reward.png", "récompense moyenne par épisode"),
                                 ("lap_rate", "learning_laps.png", "taux de tours valides")):
        n_seeds = progress.groupby("condition")["seed"].nunique()
        fig, ax = _setup(f"Courbes d'apprentissage — {ylabel}", "pas d'entraînement", ylabel,
                         "runs/*/progress.csv, évaluation déterministe ; moyenne ± écart-type entre graines")
        for condition in _ordered(progress["condition"]):
            df = progress[progress["condition"] == condition]
            # Seuls les pas évalués par toutes les graines de la condition
            steps = df.groupby("step")["seed"].nunique()
            df = df[df["step"].isin(steps[steps == n_seeds[condition]].index)]
            stats = df.groupby("step")[column].agg(["mean", "std"]).fillna(0.0)
            color, marker = STYLE[condition]
            ax.plot(stats.index, stats["mean"], color=color, linewidth=2, marker=marker, markersize=5,
                    markevery=max(1, len(stats) // 10), label=f"{condition} ({_seeds(n_seeds[condition])})")
            ax.fill_between(stats.index, stats["mean"] - stats["std"], stats["mean"] + stats["std"],
                            color=color, alpha=0.15, linewidth=0)
        if column == "lap_rate":
            ax.set_ylim(-0.02, 1.02)
        ax.legend(frameon=False, fontsize=8, labelcolor=INK)
        _save(fig, out, name, written)


def _per_seed(df: pd.DataFrame, value: str) -> pd.DataFrame:
    """Mean of ``value`` per condition and seed, then mean and std across seeds."""
    per_seed = df.groupby(["condition", "seed"])[value].mean().reset_index()
    return per_seed.groupby("condition")[value].agg(["mean", "std", "count"]).fillna(0.0)


def _bars(stats: pd.DataFrame, classic: float | None, title: str, ylabel: str, source: str,
          out: Path, name: str, written: list[Path], ylim=None) -> None:
    fig, ax = _setup(title, "condition", ylabel, source)
    order = _ordered(stats.index)
    for k, condition in enumerate(order):
        color, _ = STYLE[condition]
        row = stats.loc[condition]
        ax.bar(k, row["mean"], width=0.6, color=color, edgecolor="#fcfcfb", linewidth=2)
        ax.errorbar(k, row["mean"], yerr=row["std"], color=INK, capsize=4, linewidth=1)
        ax.annotate(f"{row['mean']:.2f}", (k, row["mean"]), textcoords="offset points", xytext=(10, 3),
                    fontsize=8, color=INK)
    if classic is not None:
        ax.axhline(classic, color=CLASSIC_COLOR, linestyle="--", linewidth=1.5)
        # Étiquette au bord droit du graphique (x en fraction des axes, y en données)
        ax.annotate(f"pilote classique : {classic:.2f}", xy=(1.0, classic), xycoords=("axes fraction", "data"),
                    textcoords="offset points", xytext=(0, 4), ha="right", fontsize=8, color=MUTED)
    ax.set_xticks(range(len(order)), [f"{c}\n({int(stats.loc[c, 'count'])} gr.)" for c in order], fontsize=7)
    if ylim:
        ax.set_ylim(*ylim)
    _save(fig, out, name, written)


def _robustness(test: pd.DataFrame, value: str, ylabel: str, name: str, out: Path, written: list[Path],
                ylim=None) -> None:
    """``value`` on the test tracks against the mu factor, per condition, with the classic driver as reference."""
    fig, ax = _setup(f"Robustesse à l'adhérence — {ylabel}", "facteur d'adhérence μ", ylabel,
                     "results/eval.csv, circuits de test ; moyenne ± écart-type entre graines")
    for condition in _ordered(test["condition"]):
        df = test[test["condition"] == condition]
        stats = df.groupby(["mu_factor", "seed"])[value].mean().groupby("mu_factor").agg(["mean", "std"]).fillna(0)
        color, marker = STYLE[condition]
        ax.errorbar(stats.index, stats["mean"], yerr=stats["std"], color=color, marker=marker, markersize=7,
                    linewidth=2, capsize=3, label=condition)
    c = test[test["condition"] == "classic"].groupby("mu_factor")[value].mean()
    if not c.empty:
        ax.plot(c.index, c.values, color=CLASSIC_COLOR, linestyle="--", marker="x", linewidth=1.5,
                label="pilote classique (connaît μ)")
    if ylim:
        ax.set_ylim(*ylim)
    ax.invert_xaxis()  # de l'adhérence normale vers la piste glissante
    ax.legend(frameon=False, fontsize=8, labelcolor=INK)
    _save(fig, out, name, written)


def plot_eval(ev: pd.DataFrame, out: Path, written: list[Path]) -> None:
    agents = ev[ev["condition"] != "classic"]
    classic = ev[ev["condition"] == "classic"]
    test1 = agents[(agents["split"] == "test") & (agents["mu_factor"] == 1.0)]
    classic_test1 = classic[(classic["split"] == "test") & (classic["mu_factor"] == 1.0)]
    source = "results/eval.csv (politique figée, dernier checkpoint), circuits de test, μ = 1,0"

    if not test1.empty:
        _bars(_per_seed(test1, "lap"), classic_test1["lap"].mean() if not classic_test1.empty else None,
              "Taux de tours valides, circuits de test, μ = 1,0", "taux de tours", source,
              out, "laps_test_mu1.png", written, ylim=(0, 1.05))
        laps = test1[test1["outcome"] == "lap"]
        classic_laps = classic_test1[classic_test1["outcome"] == "lap"]
        if not laps.empty:
            _bars(_per_seed(laps, "lap_time"), classic_laps["lap_time"].mean() if not classic_laps.empty else None,
                  "Temps au tour moyen (tours valides seulement), circuits de test, μ = 1,0", "temps au tour (s)",
                  source, out, "lap_time_test_mu1.png", written)

    test = ev[ev["split"] == "test"]
    if test["mu_factor"].nunique() > 1:
        _robustness(test, "lap", "taux de tours", "robustness_mu.png", out, written, ylim=(-0.02, 1.05))
        laps = test[test["outcome"] == "lap"]
        if laps["mu_factor"].nunique() > 1:
            _robustness(laps, "lap_time", "temps au tour moyen (s), tours valides", "robustness_lap_time.png",
                        out, written)

    mu1 = agents[agents["mu_factor"] == 1.0]
    if set(mu1["split"]) >= {"train", "test"}:
        fig, ax = _setup("Généralisation — taux de tours à μ = 1,0", "condition", "taux de tours",
                         "results/eval.csv ; plein = circuits d'entraînement, hachuré = circuits de test")
        order = _ordered(mu1["condition"])
        for k, condition in enumerate(order):
            color, _ = STYLE[condition]
            for offset, split, hatch in ((-0.17, "train", None), (0.17, "test", "///")):
                df = mu1[(mu1["condition"] == condition) & (mu1["split"] == split)]
                if df.empty:
                    continue
                stats = df.groupby("seed")["lap"].mean()
                ax.bar(k + offset, stats.mean(), width=0.32, color=color, hatch=hatch, edgecolor="#fcfcfb",
                       linewidth=2, yerr=stats.std() if len(stats) > 1 else 0, capsize=3,
                       error_kw={"ecolor": INK, "elinewidth": 1})
        ax.set_xticks(range(len(order)), order, fontsize=7)
        ax.set_ylim(0, 1.05)
        _save(fig, out, "train_vs_test.png", written)


def make_figures(runs_dir: Path, eval_csv: Path, out: Path) -> list[Path]:
    written: list[Path] = []
    progress = load_progress(runs_dir)
    if progress.empty:
        print("aucun progress.csv de run réel : pas de courbe d'apprentissage")
    else:
        plot_learning(progress, out, written)
    ev = load_eval(runs_dir, eval_csv)
    if ev.empty:
        print("aucune ligne de results/eval.csv rattachée à un run réel : pas de figure d'évaluation")
    else:
        plot_eval(ev, out, written)
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--runs-dir", type=Path, default=ROOT / "runs")
    parser.add_argument("--eval-csv", type=Path, default=ROOT / "results" / "eval.csv")
    parser.add_argument("--out", type=Path, default=ROOT / "results" / "figures")
    args = parser.parse_args()
    for path in make_figures(args.runs_dir, args.eval_csv, args.out):
        print(path)


if __name__ == "__main__":
    main()
