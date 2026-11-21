"""Write one config.yaml per experimental condition and seed in configs/.

Usage : ``python -m tools.make_configs [--steps 1000000] [--out configs]``

Conditions (même budget de pas, mêmes circuits, mêmes récompenses) :
- ppo_mufixe, dqn_mufixe, sac_mufixe, qlearning_mufixe, sarsa_mufixe, montecarlo_mufixe :
  mu fixé à 1,0 ;
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
    "sarsa_mufixe": ("sarsa", "fixed", {}),
    "montecarlo_mufixe": ("montecarlo", "fixed", {}),
    "ppo_mufixe_nolambda": ("ppo", "fixed", {"lambda_steer": 0.0}),
}


# --- Série v2 (21/11/2026) : voiture F1 réaliste sur de vrais circuits ---
# Entraînement sur les 17 circuits réels de la base TUM (real_*), test sur les 8 circuits F1
# (f1_*), jamais vus ; départs aléatoires pour travailler tous les virages.
from tools.import_f1_tracks import CIRCUITS as _F1_TEST, TRAIN_CIRCUITS as _REAL_TRAIN  # noqa: E402

REAL_TRAIN_TRACKS = [track_id for track_id, _ in _REAL_TRAIN.values()]
F1_TEST_TRACKS = [track_id for track_id, _ in _F1_TEST.values()]
F1_ENV = {"car": "f1_2024", "random_start": True}
F1_MU_RANGE = [0.6, 1.1]
# Récompense v2 : la sortie de piste coûte 10 + 0,01 v² (≈ 90 à 300 km/h), sinon un agent à
# 340 km/h préfère foncer et sortir plutôt que freiner (constaté sur le premier essai PPO).
F1_REWARD_EXTRA = {"k_offtrack_speed": 0.01}
F1_GAMMA = 0.995  # horizon ≈ 200 décisions = 10 s (0,99 : 5 s, trop court pour anticiper à 340 km/h)
BIG_NET = [256, 256]  # réseaux plus grands pour la série v2 (ablation : PPO avec 2 × 64)
_SB3_NET = {"policy_kwargs": {"net_arch": BIG_NET}}
# condition -> réglages ; budgets fixés après mesure du débit (voir docs/EXPLICATIONS.md)
F1_CONDITIONS = {
    # Actions continues (volant + pédale unique)
    "ppo_f1": {"algo": "ppo", "mu_mode": "fixed", "total_steps": 3_000_000, "n_envs": 4,
               "hyperparams": {"n_steps": 1024, "batch_size": 256, **_SB3_NET}},
    "ppo_f1_mualea": {"algo": "ppo", "mu_mode": "uniform", "total_steps": 3_000_000, "n_envs": 4,
                      "hyperparams": {"n_steps": 1024, "batch_size": 256, **_SB3_NET}},
    "ppo_f1_net64": {"algo": "ppo", "mu_mode": "fixed", "total_steps": 3_000_000, "n_envs": 4,
                     "hyperparams": {"n_steps": 1024, "batch_size": 256, "policy_kwargs": {"net_arch": [64, 64]}}},
    "sac_f1": {"algo": "sac", "mu_mode": "fixed", "total_steps": 1_000_000, "n_envs": 1,
               "hyperparams": {"learning_starts": 10_000, **_SB3_NET}},
    "td3_f1": {"algo": "td3", "mu_mode": "fixed", "total_steps": 1_000_000, "n_envs": 1,
               "hyperparams": {"learning_starts": 10_000, **_SB3_NET}},
    "tqc_f1": {"algo": "tqc", "mu_mode": "fixed", "total_steps": 1_000_000, "n_envs": 1,
               "hyperparams": {"learning_starts": 10_000, **_SB3_NET}},
    # Actions discrètes (discrete9) : Q-Learning profond (DQN, QR-DQN), SARSA et Monte-Carlo profonds
    "dqn_f1": {"algo": "dqn", "mu_mode": "fixed", "total_steps": 1_500_000, "n_envs": 1,
               "hyperparams": {"learning_starts": 10_000, "exploration_fraction": 0.2, **_SB3_NET}},
    "qrdqn_f1": {"algo": "qrdqn", "mu_mode": "fixed", "total_steps": 1_500_000, "n_envs": 1,
                 "hyperparams": {"learning_starts": 10_000, "exploration_fraction": 0.2, **_SB3_NET}},
    "deep_sarsa_f1": {"algo": "deep_sarsa", "mu_mode": "fixed", "total_steps": 1_500_000, "n_envs": 1,
                      "hyperparams": {"net_arch": BIG_NET}},
    "deep_mc_f1": {"algo": "deep_mc", "mu_mode": "fixed", "total_steps": 1_500_000, "n_envs": 1,
                   "hyperparams": {"net_arch": BIG_NET}},
    # Tabulaires, avec le découpage F1 de 5 760 états (agents/discretize.py)
    "qlearning_f1": {"algo": "qlearning", "mu_mode": "fixed", "total_steps": 3_000_000, "n_envs": 1,
                     "hyperparams": {"epsilon_decay_steps": 1_000_000}},
    "sarsa_f1": {"algo": "sarsa", "mu_mode": "fixed", "total_steps": 3_000_000, "n_envs": 1,
                 "hyperparams": {"epsilon_decay_steps": 1_000_000}},
    "montecarlo_f1": {"algo": "montecarlo", "mu_mode": "fixed", "total_steps": 3_000_000, "n_envs": 1,
                      "hyperparams": {"epsilon_decay_steps": 1_000_000}},
}
ALL_CONDITIONS = list(CONDITIONS) + list(F1_CONDITIONS)


def make_f1_config(condition: str, seed: int, total_steps: int | None = None) -> dict:
    spec = F1_CONDITIONS[condition]
    space = ALGO_ACTION_SPACE[spec["algo"]]
    env = {**copy.deepcopy(DEFAULT_CONFIG["env"]), **F1_ENV,
           "action_space": "pedal" if space == "continuous" else space}  # pédale unique : exploration plus simple
    cfg = {
        "schema": CONFIG_SCHEMA,
        "algo": spec["algo"],
        "seed": seed,
        "total_steps": total_steps or spec["total_steps"],
        "n_envs": spec["n_envs"],
        "tracks": {"train": REAL_TRAIN_TRACKS, "test": F1_TEST_TRACKS},
        "mu": {"mode": spec["mu_mode"], "value": 1.0, "range": F1_MU_RANGE},
        "env": env,
        "reward": {**DEFAULT_CONFIG["reward"], **F1_REWARD_EXTRA},
        "hyperparams": {"gamma": F1_GAMMA, **copy.deepcopy(spec["hyperparams"])},
        "checkpoint_every": 100_000,
        "eval_every": 100_000,
        "eval_episodes": 5,
    }
    validate_config(cfg)
    return cfg


def make_config(condition: str, seed: int, total_steps: int = BUDGET) -> dict:
    if condition in F1_CONDITIONS:
        return make_f1_config(condition, seed, None if total_steps == BUDGET else total_steps)
    algo, mu_mode, reward_changes = CONDITIONS[condition]
    env = copy.deepcopy(DEFAULT_CONFIG["env"])
    for key in ("car", "random_start"):  # série v1 : configuration inchangée (modèle v1, départ sur la ligne)
        env.pop(key)
    env["action_space"] = ALGO_ACTION_SPACE[algo]
    cfg = {
        "schema": "f1rl.config/1.1",  # série v1 : n'utilise pas les options de la version 1.2
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
    env = cfg.get("env", {})
    if env.get("car") == "f1_2024" and cfg["tracks"]["train"] == REAL_TRAIN_TRACKS:
        for name, spec in F1_CONDITIONS.items():
            if cfg["algo"] == spec["algo"] and cfg["mu"]["mode"] == spec["mu_mode"]:
                net = cfg["hyperparams"].get("policy_kwargs", {}).get("net_arch")
                spec_net = spec["hyperparams"].get("policy_kwargs", {}).get("net_arch")
                if net == spec_net:  # PPO 2 × 256 et PPO 2 × 64 (ablation) sont deux conditions
                    return name
        return None
    if cfg["tracks"]["train"] != TRAIN_TRACKS or env.get("car", "v1") != "v1":
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
    for condition in ALL_CONDITIONS:
        for seed in SEEDS:
            path = args.out / f"{condition}_s{seed}.yaml"
            header = f"# Condition {condition}, graine {seed} — généré par tools/make_configs.py\n"
            path.write_text(header + yaml.safe_dump(make_config(condition, seed, args.steps), sort_keys=False),
                            encoding="utf-8")
            print(path)


if __name__ == "__main__":
    main()
