"""Evaluate a frozen policy: write replay.json files and append rows to results/eval.csv.

Usage :
    python -m agents.evaluate classic --run-id classic_demo --tracks demo_oval --mu 1.0
    python -m agents.evaluate runs/<run_id>/checkpoints/step_1000000.zip \\
        --tracks gen_10 gen_11 --mu 1.0 0.8 0.6 --episodes 3 [--with-activations]
    (même chose avec un fichier .npy pour le Q-Learning)

Pour un checkpoint, la configuration du run (``runs/<run_id>/config.yaml``)
donne l'algorithme, la graine, le mode de mu et les sections env/reward : on
évalue dans les mêmes conditions que l'entraînement, sauf le circuit et le
facteur mu imposés. La politique est figée (déterministe, pas d'exploration).

Une image (frame) de replay décrit le pas t : ``obs`` est l'observation vue
par l'agent pour décider, ``action`` la commande appliquée, ``activations``
les couches cachées pour cette décision ; x, y, psi, v, delta, sensors_m,
progress, checkpoint, reward, slip et off_track décrivent le résultat, à
l'instant t.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

import numpy as np
import yaml

from agents.classic_driver import ClassicDriver
from env.f1_env import F1Env, load_tracks
from sim.sensors import SENSOR_RANGE
from tools.validate import EVAL_COLUMNS, REPLAY_SCHEMA, validate_config, validate_replay

ROOT = Path(__file__).resolve().parent.parent
EVAL_CSV = ROOT / "results" / "eval.csv"


# ----------------------------------------------------------------------
# Politiques figées
# ----------------------------------------------------------------------


class ClassicPolicy:
    algo = "classic"
    checkpoint = "none"
    train_steps = 0
    network = None

    def __init__(self):
        self.driver = ClassicDriver()

    def act(self, env: F1Env, obs: np.ndarray):
        return self.driver.act(env)

    def activations(self):
        return None


class QTablePolicy:
    """Greedy policy of a Q-table saved by a tabular agent (state from agents/discretize.py)."""

    network = None

    def __init__(self, algo: str, path: Path, train_steps: int):
        self.q = np.load(path)
        self.algo, self.checkpoint, self.train_steps = algo, path.stem, train_steps

    def act(self, env: F1Env, obs: np.ndarray):
        from agents.discretize import discrete_state

        return int(np.argmax(self.q[discrete_state(env)]))

    def activations(self):
        return None


# Sous-réseau dont on lit les couches cachées, pour chaque algorithme SB3
_HIDDEN_NET = {
    "ppo": lambda policy: policy.mlp_extractor.policy_net,
    "sac": lambda policy: policy.actor.latent_pi,
    "dqn": lambda policy: policy.q_net.q_net,
}


class SB3Policy:
    """Stable-Baselines3 checkpoint, used with ``deterministic=True``."""

    def __init__(self, algo: str, path: Path, train_steps: int, with_activations: bool):
        import stable_baselines3 as sb3
        import torch.nn as nn

        self.algo, self.checkpoint, self.train_steps = algo, path.stem, train_steps
        self.model = getattr(sb3, algo.upper()).load(path, device="cpu")
        policy = self.model.policy
        hidden = _HIDDEN_NET[algo](policy)
        modules = list(hidden)
        # Couches cachées = couches linéaires suivies d'une activation (pour DQN, q_net contient aussi la sortie)
        hidden_sizes = [m.out_features for m, nxt in zip(modules, modules[1:])
                        if isinstance(m, nn.Linear) and isinstance(nxt, policy.activation_fn)]
        obs_dim = self.model.observation_space.shape[0]
        space = self.model.action_space
        out_dim = int(space.n) if hasattr(space, "n") else int(space.shape[0])
        self.network = {
            "layers": [obs_dim, *hidden_sizes, out_dim],
            "activation": policy.activation_fn.__name__.lower(),
        }
        # Crochets (hooks) PyTorch : chaque fonction d'activation de la politique
        # recopie sa sortie à chaque passage avant (forward)
        self._acts: list[list[float]] = []
        self.with_activations = with_activations
        if with_activations:
            for module in hidden:
                if isinstance(module, policy.activation_fn):
                    module.register_forward_hook(self._record)

    def _record(self, module, inputs, output):
        self._acts.append([round(float(v), 4) for v in output.detach().reshape(-1)])

    def act(self, env: F1Env, obs: np.ndarray):
        self._acts = []
        action, _ = self.model.predict(obs, deterministic=True)
        return action

    def activations(self):
        return self._acts if self.with_activations else None


def _train_steps(path: Path) -> int:
    match = re.search(r"step_(\d+)", path.stem)
    return int(match.group(1)) if match else 0


def load_policy(agent: str, with_activations: bool = False):
    """Policy, run config (None for the classic driver) and run_id (None for classic)."""
    if agent == "classic":
        return ClassicPolicy(), None, None
    path = Path(agent)
    run_dir = path.resolve().parent.parent  # runs/<run_id>/checkpoints/<fichier>
    with open(run_dir / "config.yaml", encoding="utf-8") as f:
        config = yaml.safe_load(f)
    validate_config(config)  # on n'évalue que des runs dont la configuration respecte le contrat
    if path.suffix == ".npy":
        policy = QTablePolicy(config["algo"], path, _train_steps(path))
    else:
        policy = SB3Policy(config["algo"], path, _train_steps(path), with_activations)
    return policy, config, run_dir.name


# ----------------------------------------------------------------------
# Épisodes
# ----------------------------------------------------------------------


def _outcome(env: F1Env, info: dict) -> str:
    if info["lap_time"] is not None:
        return "lap"
    if info["off_track"]:
        return "off_track"
    return "stalled" if env.stall >= env.stall_steps else "timeout"


def run_episode(env: F1Env, policy, track_id: str, mu_factor: float, seed: int) -> tuple[list[dict], dict]:
    """Play one episode with the frozen policy; return (frames, summary)."""
    obs, info = env.reset(seed=seed, options={"track_id": track_id, "mu_factor": mu_factor})
    frames, total, off_tracks = [], 0.0, 0
    while True:
        action = policy.act(env, obs)
        steer, throttle, brake = env._decode_action(action)
        next_obs, reward, terminated, truncated, info = env.step(action)
        total += reward
        off_tracks += int(info["off_track"])
        car = env.car
        frame = {
            "t": round(env.steps * env.dt, 4),
            "x": round(car.x, 4), "y": round(car.y, 4), "psi": round(car.psi, 5),
            "v": round(car.v, 4), "delta": round(car.delta, 5),
            "action": {"steer": round(steer, 4), "throttle": round(throttle, 4), "brake": round(brake, 4)},
            "obs": [round(float(v), 4) for v in obs],
            "sensors_m": [round(float(v) * SENSOR_RANGE, 3) for v in next_obs[:7]],
            "progress": round(info["progress"], 5),
            "checkpoint": info["checkpoint"],
            "reward": round(reward, 5),
            "slip": info["slip"],
            "off_track": info["off_track"],
        }
        acts = policy.activations()
        if acts is not None:
            frame["activations"] = acts
        frames.append(frame)
        obs = next_obs
        if terminated or truncated:
            break
    summary = {
        "outcome": _outcome(env, info),
        "lap_time": None if info["lap_time"] is None else round(info["lap_time"], 3),
        "total_reward": round(total, 4),
        "steps": env.steps,
        "off_tracks": off_tracks,
    }
    return frames, summary


def append_eval_rows(rows: list[dict], path: Path = EVAL_CSV) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    new = not path.exists()
    with open(path, "a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=EVAL_COLUMNS)
        if new:
            writer.writeheader()
        writer.writerows(rows)


def evaluate(agent: str, track_ids: list[str], mu_factors: list[float], episodes: int = 1,
             run_id: str | None = None, with_activations: bool = False, save_replays: bool = True,
             eval_csv: Path = EVAL_CSV, runs_dir: Path = ROOT / "runs") -> list[dict]:
    """Evaluate ``agent`` on every track × mu factor × episode; return the eval.csv rows written."""
    policy, config, ckpt_run_id = load_policy(agent, with_activations)
    run_id = run_id or ckpt_run_id
    if run_id is None:
        raise ValueError("--run-id is required for the classic driver")
    env = F1Env(config, load_tracks(track_ids))
    seed = int(config["seed"]) if config else 0
    mu_mode = config["mu"]["mode"] if config else "fixed"
    replay_dir = runs_dir / run_id / "replays"

    rows = []
    for track_id in track_ids:
        for mu_factor in mu_factors:
            for episode in range(episodes):
                episode_seed = seed * 1000 + episode
                frames, summary = run_episode(env, policy, track_id, mu_factor, episode_seed)
                replay_path = ""
                if save_replays:
                    replay = {
                        "schema": REPLAY_SCHEMA, "run_id": run_id,
                        "agent": {"algo": policy.algo, "checkpoint": policy.checkpoint,
                                  "train_steps": policy.train_steps},
                        "track_id": track_id, "mu_factor": mu_factor, "seed": episode_seed, "dt": env.dt,
                    }
                    if policy.network is not None:
                        replay["network"] = policy.network
                    replay.update(frames=frames, summary=summary)
                    validate_replay(replay)
                    replay_dir.mkdir(parents=True, exist_ok=True)
                    out = replay_dir / f"{policy.algo}_{policy.checkpoint}_{track_id}_mu{mu_factor:.2f}_ep{episode}.json"
                    out.write_text(json.dumps(replay), encoding="utf-8")
                    replay_path = str(out.relative_to(runs_dir.parent)) if out.is_relative_to(runs_dir.parent) else str(out)
                rows.append({
                    "run_id": run_id, "algo": policy.algo, "seed": seed, "mu_mode": mu_mode,
                    "checkpoint": policy.checkpoint, "track_id": track_id, "split": env.tracks_by_id[track_id].split,
                    "mu_factor": mu_factor, "episode": episode, "outcome": summary["outcome"],
                    "lap_time": "" if summary["lap_time"] is None else summary["lap_time"],
                    "total_reward": summary["total_reward"], "steps": summary["steps"],
                    "offtracks": summary["off_tracks"], "replay_path": replay_path,
                })
    append_eval_rows(rows, eval_csv)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("agent", help="'classic', or a checkpoint runs/<run_id>/checkpoints/<file>.zip|.npy")
    parser.add_argument("--tracks", nargs="+", required=True, help="track ids")
    parser.add_argument("--mu", nargs="+", type=float, default=[1.0], help="mu factors (default: 1.0)")
    parser.add_argument("--episodes", type=int, default=1)
    parser.add_argument("--run-id", help="run id (required for the classic driver)")
    parser.add_argument("--with-activations", action="store_true", help="record hidden layers (SB3 only)")
    parser.add_argument("--no-replay", action="store_true", help="only append to eval.csv")
    parser.add_argument("--eval-csv", type=Path, default=EVAL_CSV)
    args = parser.parse_args()

    rows = evaluate(args.agent, args.tracks, args.mu, args.episodes, args.run_id,
                    args.with_activations, not args.no_replay, args.eval_csv)
    for r in rows:
        lap = f"{r['lap_time']} s" if r["lap_time"] != "" else "-"
        print(f"{r['track_id']:10s} mu={r['mu_factor']:.2f} ep{r['episode']}  {r['outcome']:9s} "
              f"tour {lap:9s} récompense {r['total_reward']:9.2f}  {r['replay_path']}")
    print(f"{len(rows)} lignes ajoutées à {args.eval_csv}")


if __name__ == "__main__":
    main()
