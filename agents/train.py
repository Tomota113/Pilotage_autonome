"""Train an agent from a config.yaml file (schema f1rl.config/1.0).

Usage : ``python -m agents.train configs/<fichier>.yaml [--steps N]``

- crée ``runs/<run_id>/`` avec une copie de la configuration effective
  (``total_steps`` remplacé par ``--steps`` s'il est donné) ;
- entraîne PPO / SAC (actions continues) ou DQN (``discrete9``) de
  Stable-Baselines3, politique MLP 2 × 64, ou une méthode tabulaire (Q-Learning,
  SARSA, Monte-Carlo) sur l'état discrétisé ;
- checkpoint tous les ``checkpoint_every`` pas dans ``checkpoints/step_<N>`` ;
- évaluation déterministe tous les ``eval_every`` pas (et à la fin) sur
  ``eval_episodes`` épisodes -> une ligne de ``progress.csv``.

run_id = <algo>_<circuit ou "multi">_<mufixe|mualea>[_f1]_s<graine>_<AAAAMMJJ-HHMM> (« _f1 » : voiture F1 réaliste)
"""

from __future__ import annotations

import argparse
import copy
import csv
import time
from datetime import datetime
from pathlib import Path
from typing import Callable

import numpy as np
import yaml

from env.f1_env import TRACKS_DIR, F1Env, load_tracks
from tools.validate import TABULAR_ALGOS, validate_config

ROOT = Path(__file__).resolve().parent.parent
PROGRESS_COLUMNS = (
    "run_id", "algo", "seed", "mu_mode", "step", "wall_time_s", "mean_reward", "std_reward",
    "lap_rate", "mean_lap_time", "offtracks_per_ep",
)
NET_ARCH = [64, 64]  # 2 couches cachées de 64 (contrainte du PC sans GPU)


def make_run_id(cfg: dict, now: datetime | None = None) -> str:
    train = cfg["tracks"]["train"]
    where = train[0] if len(train) == 1 else "multi"
    mu = "mufixe" if cfg["mu"]["mode"] == "fixed" else "mualea"
    car = "_f1" if cfg["env"].get("car", "v1") == "f1_2024" else ""  # série v2 : voiture F1 réaliste
    stamp = (now or datetime.now()).strftime("%Y%m%d-%H%M")
    return f"{cfg['algo']}_{where}_{mu}{car}_s{cfg['seed']}_{stamp}"


def evaluate_episodes(env: F1Env, act: Callable[[np.ndarray], object], n_episodes: int) -> dict:
    """Run n_episodes with a frozen policy ``act(obs) -> action``; aggregate the progress.csv metrics.

    Les épisodes d'évaluation utilisent les graines 0 .. n-1 : le même ensemble de
    circuits et de mu à chaque évaluation, pour que la courbe soit comparable.
    """
    rewards, lap_times, offtracks = [], [], 0
    for k in range(n_episodes):
        obs, info = env.reset(seed=k)
        total, done = 0.0, False
        while not done:
            obs, r, terminated, truncated, info = env.step(act(obs))
            total += r
            done = terminated or truncated
        rewards.append(total)
        offtracks += int(info["off_track"])
        if info["lap_time"] is not None:
            lap_times.append(info["lap_time"])
    return {
        "mean_reward": round(float(np.mean(rewards)), 4),
        "std_reward": round(float(np.std(rewards)), 4),
        "lap_rate": round(len(lap_times) / n_episodes, 4),
        "mean_lap_time": round(float(np.mean(lap_times)), 3) if lap_times else "",
        "offtracks_per_ep": round(offtracks / n_episodes, 4),
    }


class ProgressLog:
    """Append rows to runs/<run_id>/progress.csv."""

    def __init__(self, path: Path, meta: dict):
        """``meta`` gives the constant columns: run_id, algo, seed, mu_mode."""
        self.path = path
        self.meta = {k: meta[k] for k in ("run_id", "algo", "seed", "mu_mode")}
        self.start = time.perf_counter()
        with open(path, "w", encoding="utf-8", newline="") as f:
            csv.DictWriter(f, fieldnames=PROGRESS_COLUMNS).writeheader()

    def write(self, step: int, metrics: dict) -> dict:
        row = {**self.meta, "step": step, "wall_time_s": round(time.perf_counter() - self.start, 1), **metrics}
        with open(self.path, "a", encoding="utf-8", newline="") as f:
            csv.DictWriter(f, fieldnames=PROGRESS_COLUMNS).writerow(row)
        return row


def run_meta(cfg: dict, run_id: str) -> dict:
    return {"run_id": run_id, "algo": cfg["algo"], "seed": cfg["seed"], "mu_mode": cfg["mu"]["mode"]}


def _print_row(row: dict) -> None:
    rate = row["step"] / max(row["wall_time_s"], 1e-9)
    print(f"pas {row['step']:>9}  {row['wall_time_s']:8.1f} s  ({rate:6.0f} pas/s)  "
          f"récompense {row['mean_reward']:9.2f} ± {row['std_reward']:<8.2f} tours {row['lap_rate']:.0%}  "
          f"sorties/ép {row['offtracks_per_ep']}", flush=True)


def train_sb3(cfg: dict, run_dir: Path, run_id: str, tracks_dir: Path = TRACKS_DIR) -> None:
    import stable_baselines3 as sb3
    import torch

    # Réseaux 2 × 64 : un seul thread suffit, et plusieurs entraînements peuvent tourner en
    # parallèle sans se disputer les cœurs (PyTorch prend tous les cœurs par défaut)
    torch.set_num_threads(1)
    from stable_baselines3.common.callbacks import BaseCallback
    from stable_baselines3.common.monitor import Monitor
    from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv

    train_tracks = load_tracks(cfg["tracks"]["train"], tracks_dir)
    make = [lambda: Monitor(F1Env(cfg, train_tracks)) for _ in range(cfg["n_envs"])]
    # Plusieurs environnements : un processus chacun (les 4 cœurs du PC travaillent en parallèle)
    vec_env = SubprocVecEnv(make) if cfg["n_envs"] > 1 else DummyVecEnv(make)
    # L'évaluation part toujours de la ligne de départ, même si l'entraînement part au hasard
    eval_cfg = copy.deepcopy(cfg)
    eval_cfg["env"] = {**eval_cfg["env"], "random_start": False}
    eval_env = F1Env(eval_cfg, train_tracks)

    hyper = copy.deepcopy(cfg["hyperparams"])
    policy_kwargs = {"net_arch": NET_ARCH, **hyper.pop("policy_kwargs", {})}
    model = getattr(sb3, cfg["algo"].upper())(
        "MlpPolicy", vec_env, seed=cfg["seed"], device="cpu", verbose=0, policy_kwargs=policy_kwargs, **hyper
    )
    ckpt_dir = run_dir / "checkpoints"
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    log = ProgressLog(run_dir / "progress.csv", run_meta(cfg, run_id))

    def evaluate_now(step: int) -> None:
        metrics = evaluate_episodes(eval_env, lambda obs: model.predict(obs, deterministic=True)[0],
                                    cfg["eval_episodes"])
        _print_row(log.write(step, metrics))

    class Periodic(BaseCallback):
        """Checkpoint and evaluation every N environment steps."""

        def __init__(self):
            super().__init__()
            self.next_ckpt, self.next_eval = cfg["checkpoint_every"], cfg["eval_every"]

        def _on_step(self) -> bool:
            if self.num_timesteps >= self.next_ckpt:
                model.save(ckpt_dir / f"step_{self.num_timesteps}")
                self.next_ckpt += cfg["checkpoint_every"]
            if self.num_timesteps >= self.next_eval:
                evaluate_now(self.num_timesteps)
                self.next_eval += cfg["eval_every"]
            return True

    model.learn(total_timesteps=cfg["total_steps"], callback=Periodic())
    vec_env.close()
    # Checkpoint et évaluation finale (s'ils ne viennent pas d'être faits)
    step = model.num_timesteps
    if not (ckpt_dir / f"step_{step}.zip").exists():
        model.save(ckpt_dir / f"step_{step}")
    with open(log.path, encoding="utf-8") as f:
        last = list(csv.DictReader(f))[-1:] or [{"step": ""}]
    if last[0]["step"] != str(step):
        evaluate_now(step)


def train_tabular(cfg: dict, run_dir: Path, run_id: str, tracks_dir: Path = TRACKS_DIR) -> None:
    """Q-Learning, SARSA or Monte-Carlo on the discretized state (agents/discretize.py)."""
    from agents import monte_carlo, qlearning, sarsa
    from agents.discretize import DiscreteStateWrapper

    agent_cls, train = {
        "qlearning": (qlearning.QLearningAgent, qlearning.train),
        "sarsa": (sarsa.SarsaAgent, sarsa.train),
        "montecarlo": (monte_carlo.MonteCarloAgent, monte_carlo.train),
    }[cfg["algo"]]
    train_tracks = load_tracks(cfg["tracks"]["train"], tracks_dir)
    env = DiscreteStateWrapper(F1Env(cfg, train_tracks))
    eval_env = DiscreteStateWrapper(F1Env(cfg, train_tracks))
    agent = agent_cls(env.observation_space.n, env.action_space.n, seed=cfg["seed"], **cfg["hyperparams"])
    agent = train(agent, env, eval_env, cfg["total_steps"], cfg["eval_every"], cfg["eval_episodes"],
                  run_dir / "progress.csv", run_meta(cfg, run_id))
    ckpt_dir = run_dir / "checkpoints"
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    agent.save(ckpt_dir / f"step_{cfg['total_steps']}.npy")


def main(argv: list[str] | None = None) -> Path:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("config", type=Path, help="configs/<file>.yaml")
    parser.add_argument("--steps", type=int, help="override total_steps (short trial runs)")
    parser.add_argument("--runs-dir", type=Path, default=ROOT / "runs")
    parser.add_argument("--run-id", help="override the generated run identifier")
    parser.add_argument("--tracks-dir", type=Path, default=TRACKS_DIR, help="directory of the track.json files")
    args = parser.parse_args(argv)

    with open(args.config, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    if args.steps is not None:
        cfg["total_steps"] = args.steps
    validate_config(cfg)  # après --steps : la configuration réellement utilisée doit être valide
    if cfg["algo"] == "classic":
        raise SystemExit("le pilote classique ne s'entraîne pas : utiliser agents.evaluate")

    run_id = args.run_id if args.run_id is not None else make_run_id(cfg)
    run_dir = args.runs_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    with open(run_dir / "config.yaml", "w", encoding="utf-8") as f:
        yaml.safe_dump(cfg, f, sort_keys=False, allow_unicode=True)
    print(f"run {run_id} : {cfg['algo']} {cfg['total_steps']} pas, circuits {cfg['tracks']['train']}", flush=True)

    start = time.perf_counter()
    if cfg["algo"] in TABULAR_ALGOS:
        train_tabular(cfg, run_dir, run_id, args.tracks_dir)
    else:
        train_sb3(cfg, run_dir, run_id, args.tracks_dir)
    elapsed = time.perf_counter() - start
    print(f"terminé en {elapsed:.1f} s, soit {cfg['total_steps'] / elapsed:.0f} pas/s (évaluations comprises) "
          f"-> {run_dir}")
    return run_dir


if __name__ == "__main__":
    main()
