"""Write one config.yaml per experimental condition and seed in configs/.

Usage : ``python -m tools.make_configs [--steps 1000000] [--out configs]``

Conditions (même budget de pas, mêmes circuits, mêmes récompenses) :
- ppo_mufixe, dqn_mufixe, sac_mufixe, qlearning_mufixe : mu fixé à 1,0 ;
- ppo_mualea : mu tiré uniformément dans [0,5 ; 1,1] à chaque épisode ;
- ppo_mufixe_nolambda : ablation, pénalité de braquage lambda = 0.
Graines 0, 1 et 2 -> fichiers ``<condition>_s<graine>.yaml``.
"""

from __future__ import annotations

import argparse
import copy
from pathlib import Path

import yaml

from env.f1_env import DEFAULT_CONFIG
from tools.validate import ALGO_ACTION_SPACE, CONFIG_SCHEMA, validate_config

SEEDS = (0, 1, 2)
TRAIN_TRACKS = [f"gen_{k:02d}" for k in range(10)]
TEST_TRACKS = [f"gen_{k:02d}" for k in range(10, 15)]
BUDGET = 1_000_000  # pas d'entraînement par run (voir docs/EXPLICATIONS.md, STOP 2)

# condition -> (algo, mode de mu, changements de la récompense)
CONDITIONS = {
    "ppo_mufixe": ("ppo", "fixed", {}),
    "ppo_mualea": ("ppo", "uniform", {}),
    "dqn_mufixe": ("dqn", "fixed", {}),
    "sac_mufixe": ("sac", "fixed", {}),
    "qlearning_mufixe": ("qlearning", "fixed", {}),
    "ppo_mufixe_nolambda": ("ppo", "fixed", {"lambda_steer": 0.0}),
}


def make_config(condition: str, seed: int, total_steps: int = BUDGET) -> dict:
    algo, mu_mode, reward_changes = CONDITIONS[condition]
    env = copy.deepcopy(DEFAULT_CONFIG["env"])
    env["action_space"] = ALGO_ACTION_SPACE[algo]
    cfg = {
        "schema": CONFIG_SCHEMA,
        "algo": algo,
        "seed": seed,
        "total_steps": total_steps,
        "n_envs": 1,
        "tracks": {"train": TRAIN_TRACKS, "test": TEST_TRACKS},
        "mu": {**DEFAULT_CONFIG["mu"], "mode": mu_mode},
        "env": env,
        "reward": {**DEFAULT_CONFIG["reward"], **reward_changes},
        "hyperparams": {},
        "checkpoint_every": 50_000,
        "eval_every": 50_000,
        "eval_episodes": 5,
    }
    validate_config(cfg)
    return cfg


def condition_of(cfg: dict) -> str | None:
    """Name of the condition a run config belongs to (None if it matches none, e.g. a trial run)."""
    if cfg["tracks"]["train"] != TRAIN_TRACKS:
        return None
    for name, (algo, mu_mode, reward_changes) in CONDITIONS.items():
        reward = {**DEFAULT_CONFIG["reward"], **reward_changes}
        if cfg["algo"] == algo and cfg["mu"]["mode"] == mu_mode and cfg["reward"] == reward:
            return name
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--steps", type=int, default=BUDGET, help=f"total_steps of every run (default: {BUDGET})")
    parser.add_argument("--out", type=Path, default=Path("configs"))
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    for condition in CONDITIONS:
        for seed in SEEDS:
            path = args.out / f"{condition}_s{seed}.yaml"
            header = f"# Condition {condition}, graine {seed} — généré par tools/make_configs.py\n"
            path.write_text(header + yaml.safe_dump(make_config(condition, seed, args.steps), sort_keys=False),
                            encoding="utf-8")
            print(path)


if __name__ == "__main__":
    main()
