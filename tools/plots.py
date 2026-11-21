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

from tools.evaluate_all import REFERENCE_RUN_IDS, find_runs  # noqa: E402
from tools.make_configs import ALL_CONDITIONS, CONDITIONS, F1_CONDITIONS  # noqa: E402

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
    "sarsa_mufixe": ("#6250d6", "X"),
    "montecarlo_mufixe": ("#e34948", "*"),
}
CLASSIC_COLOR = "#52514e"  # gris : référence, pas une série comparée
# Pilotes de référence (sans apprentissage) : tracés en lignes de référence, pas en séries
REFERENCES = (("classic", "pilote classique", CLASSIC_COLOR, "--"),
              ("raceline", "pilote trajectoire idéale", "#0b0b0b", ":"))
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


# Série v2 : 13 conditions ; couleur ET marqueur les distinguent (8 couleurs validées seulement)
STYLE.update({
    "ppo_f1": ("#2a78d6", "o"), "ppo_f1_mualea": ("#eb6834", "s"), "ppo_f1_net64": ("#2a78d6", "P"),
    "sac_f1": ("#eda100", "D"), "td3_f1": ("#6250d6", "X"), "tqc_f1": ("#e34948", "*"),
    "dqn_f1": ("#1baf7a", "^"), "qrdqn_f1": ("#1baf7a", "v"), "deep_sarsa_f1": ("#008300", "<"),
    "deep_mc_f1": ("#008300", ">"), "qlearning_f1": ("#e87ba4", "h"), "sarsa_f1": ("#6250d6", "p"),
    "montecarlo_f1": ("#e34948", "d"),
})
SERIES = {  # série -> (conditions, pilotes de référence {nom: run_id}, fichier d'évaluation, dossier des figures)
    "v1": (CONDITIONS, REFERENCE_RUN_IDS, "eval.csv", "figures"),
    "v2": (F1_CONDITIONS, {"classic": "classic_f1_ref", "raceline": "raceline_f1_ref"}, "eval_f1_v2.csv", "figures_v2"),
}


def load_progress(runs_dir: Path, conditions=CONDITIONS) -> pd.DataFrame:
    frames = []
    for condition, seed, run_dir in find_runs(runs_dir, conditions):
        path = run_dir / "progress.csv"
        if path.exists():
            df = pd.read_csv(path)
            if not df.empty:
                frames.append(df.assign(condition=condition, seed=seed))
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def load_eval(runs_dir: Path, eval_csv: Path, conditions=CONDITIONS, refs=REFERENCE_RUN_IDS) -> pd.DataFrame:
    if not eval_csv.exists():
        return pd.DataFrame()
    df = pd.read_csv(eval_csv)
    by_run = {run_dir.name: condition for condition, _, run_dir in find_runs(runs_dir, conditions)}
    by_run.update({run_id: name for name, run_id in refs.items()})
    df["condition"] = df["run_id"].map(by_run)
    df = df[df["condition"].notna()].copy()
    df["lap"] = (df["outcome"] == "lap").astype(float)
    return df


def _seeds(n: int) -> str:
    return f"{n} graine{'s' if n > 1 else ''}"


def _ordered(conditions) -> list[str]:
    return [c for c in ALL_CONDITIONS if c in set(conditions)]


def _style_axes(ax) -> None:
    ax.set_facecolor("#fcfcfb")
    ax.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.tick_params(colors=MUTED, labelsize=7)


def plot_learning(progress: pd.DataFrame, out: Path, written: list[Path]) -> None:
    """Small multiples: one panel per condition, mean of the seeds (thick) and each seed (thin)."""
    conditions = _ordered(progress["condition"])
    ncols = min(4, len(conditions))
    nrows = -(-len(conditions) // ncols)  # division arrondie vers le haut
    for column, name, ylabel in (("mean_reward", "learning_reward.png", "récompense moyenne par épisode"),
                                 ("lap_rate", "learning_laps.png", "taux de tours valides")):
        fig, axes = plt.subplots(nrows, ncols, figsize=(3.2 * ncols, 2.6 * nrows + 0.6), dpi=130,
                                 sharex=True, sharey=True, squeeze=False)
        fig.patch.set_facecolor("#fcfcfb")
        fig.suptitle(f"Courbes d'apprentissage — {ylabel}", x=0.01, ha="left", fontsize=12, color=INK)
        for ax in axes.flat[len(conditions):]:
            ax.set_visible(False)
        for ax, condition in zip(axes.flat, conditions):
            _style_axes(ax)
            df = progress[progress["condition"] == condition]
            color, _ = STYLE[condition]
            for _, seed_df in df.groupby("seed"):
                ax.plot(seed_df["step"], seed_df[column], color=color, linewidth=0.8, alpha=0.45)
            # Moyenne aux pas évalués par toutes les graines de la condition
            n = df["seed"].nunique()
            steps = df.groupby("step")["seed"].nunique()
            mean = df[df["step"].isin(steps[steps == n].index)].groupby("step")[column].mean()
            ax.plot(mean.index, mean.values, color=color, linewidth=2.2)
            ax.set_title(f"{condition} ({_seeds(n)})", fontsize=9, color=INK, loc="left")
            if column == "lap_rate":
                ax.set_ylim(-0.02, 1.02)
        for ax in axes[-1]:
            ax.set_xlabel("pas d'entraînement", color=MUTED, fontsize=8)
        for ax in axes[:, 0]:
            ax.set_ylabel(ylabel, color=MUTED, fontsize=8)
        fig.text(0.01, 0.01, "Source : runs/*/progress.csv, évaluation déterministe ; trait épais = moyenne "
                 "des graines, traits fins = chaque graine", fontsize=7, color=MUTED)
        _save(fig, out, name, written)


def _per_seed(df: pd.DataFrame, value: str) -> pd.DataFrame:
    """Mean of ``value`` per condition and seed, then mean and std across seeds."""
    per_seed = df.groupby(["condition", "seed"])[value].mean().reset_index()
    return per_seed.groupby("condition")[value].agg(["mean", "std", "count"]).fillna(0.0)


def _bars(stats: pd.DataFrame, refs: dict, title: str, ylabel: str, source: str,
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
    for ref, label, color, style in REFERENCES:  # « ref » : ne pas écraser « name » (nom du fichier)
        if refs.get(ref) is None:
            continue
        value = refs[ref]
        ax.axhline(value, color=color, linestyle=style, linewidth=1.5)
        # Étiquette au bord droit du graphique (x en fraction des axes, y en données)
        ax.annotate(f"{label} : {value:.2f}", xy=(1.0, value), xycoords=("axes fraction", "data"),
                    textcoords="offset points", xytext=(0, 4), ha="right", fontsize=8, color=MUTED)
    ax.set_xticks(range(len(order)), [f"{c} ({int(stats.loc[c, 'count'])} gr.)" for c in order], fontsize=7,
                  rotation=20, ha="right")
    if ylim:
        ax.set_ylim(*ylim)
    _save(fig, out, name, written)


def _robustness(test: pd.DataFrame, value: str, ylabel: str, name: str, out: Path, written: list[Path],
                src: str, ylim=None) -> None:
    """``value`` on the test tracks against the mu factor, per condition, with the classic driver as reference."""
    fig, ax = _setup(f"Robustesse à l'adhérence — {ylabel}", "facteur d'adhérence μ", ylabel,
                     f"{src}, circuits de test ; moyenne ± écart-type entre graines")
    conditions = _ordered(test["condition"])
    for k, condition in enumerate(conditions):
        df = test[test["condition"] == condition]
        stats = df.groupby(["mu_factor", "seed"])[value].mean().groupby("mu_factor").agg(["mean", "std"]).fillna(0)
        color, marker = STYLE[condition]
        dodge = 0.0035 * (k - (len(conditions) - 1) / 2)  # léger décalage : barres d'erreur lisibles
        ax.errorbar(stats.index + dodge, stats["mean"], yerr=stats["std"], color=color, marker=marker,
                    markersize=7, linewidth=2, capsize=3, label=condition)
    for ref, label, color, style in REFERENCES:
        c = test[test["condition"] == ref].groupby("mu_factor")[value].mean()
        if not c.empty:
            ax.plot(c.index, c.values, color=color, linestyle=style, marker="x", linewidth=1.5,
                    label=f"{label} (connaît μ)")
    if ylim:
        ax.set_ylim(*ylim)
    ax.invert_xaxis()  # de l'adhérence normale vers la piste glissante
    ax.legend(frameon=False, fontsize=8, labelcolor=INK, loc="upper left", bbox_to_anchor=(1.01, 1.0))
    fig.set_size_inches(10, 4.8)
    _save(fig, out, name, written)


def plot_eval(ev: pd.DataFrame, out: Path, written: list[Path], src: str = "results/eval.csv") -> None:
    """Evaluation figures; ``src`` names the eval file in the captions (eval.csv or eval_best.csv)."""
    agents = ev[~ev["condition"].isin([name for name, *_ in REFERENCES])]
    test1 = agents[(agents["split"] == "test") & (agents["mu_factor"] == 1.0)]
    refs_test1 = ev[(ev["split"] == "test") & (ev["mu_factor"] == 1.0)]
    which = "meilleur checkpoint" if "best" in src else "dernier checkpoint"
    source = f"{src} (politique figée, {which}), circuits de test, μ = 1,0"

    def ref_values(df: pd.DataFrame, column: str) -> dict:
        """Mean of ``column`` for each reference driver present in ``df``."""
        return {name: df[df["condition"] == name][column].mean() for name, *_ in REFERENCES
                if (df["condition"] == name).any()}

    if not test1.empty:
        _bars(_per_seed(test1, "lap"), ref_values(refs_test1, "lap"),
              "Taux de tours valides, circuits de test, μ = 1,0", "taux de tours", source,
              out, "laps_test_mu1.png", written, ylim=(0, 1.05))
        laps = test1[test1["outcome"] == "lap"]
        if not laps.empty:
            _bars(_per_seed(laps, "lap_time"), ref_values(refs_test1[refs_test1["outcome"] == "lap"], "lap_time"),
                  "Temps au tour moyen (tours valides seulement), circuits de test, μ = 1,0", "temps au tour (s)",
                  source, out, "lap_time_test_mu1.png", written)

    test = ev[ev["split"] == "test"]
    if test["mu_factor"].nunique() > 1:
        _robustness(test, "lap", "taux de tours", "robustness_mu.png", out, written, src, ylim=(-0.02, 1.05))
        laps = test[test["outcome"] == "lap"]
        if laps["mu_factor"].nunique() > 1:
            _robustness(laps, "lap_time", "temps au tour moyen (s), tours valides", "robustness_lap_time.png",
                        out, written, src)

    mu1 = agents[agents["mu_factor"] == 1.0]
    if set(mu1["split"]) >= {"train", "test"}:
        fig, ax = _setup("Généralisation — taux de tours à μ = 1,0", "condition", "taux de tours",
                         f"{src} ; plein = circuits d'entraînement, hachuré = circuits de test")
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
        ax.set_xticks(range(len(order)), order, fontsize=7, rotation=20, ha="right")
        ax.set_ylim(0, 1.05)
        _save(fig, out, "train_vs_test.png", written)


def make_figures(runs_dir: Path, eval_csv: Path, out: Path, series: str = "v1") -> list[Path]:
    conditions, refs, _, _ = SERIES[series]
    written: list[Path] = []
    progress = load_progress(runs_dir, conditions)
    if progress.empty:
        print("aucun progress.csv de run réel : pas de courbe d'apprentissage")
    else:
        plot_learning(progress, out, written)
    ev = load_eval(runs_dir, eval_csv, conditions, refs)
    if ev.empty:
        print(f"aucune ligne de {eval_csv} rattachée à un run réel : pas de figure d'évaluation")
    else:
        src = eval_csv.relative_to(ROOT) if eval_csv.is_relative_to(ROOT) else eval_csv
        plot_eval(ev, out, written, str(src))
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--series", choices=tuple(SERIES), default="v1",
                        help="v1 : modèle simplifié ; v2 : voiture F1 sur circuits réels (évaluation F1)")
    parser.add_argument("--runs-dir", type=Path, default=ROOT / "runs")
    parser.add_argument("--eval-csv", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    _, _, eval_name, out_name = SERIES[args.series]
    eval_csv = args.eval_csv or ROOT / "results" / eval_name
    out = args.out or ROOT / "results" / out_name
    for path in make_figures(args.runs_dir, eval_csv, out, args.series):
        print(path)


if __name__ == "__main__":
    main()
