"""Check data-contract files: track.json, replay.json, config.yaml, eval.csv.

Usage : ``python tools/validate.py <fichier> [<fichier> ...]``
(ou ``python -m tools.validate ...``). Le code de sortie vaut 1 si au moins
un fichier est invalide.

Le type est déduit du fichier : champ ``schema`` pour un JSON
(``f1rl.track/1.0`` ou ``f1rl.replay/1.0``), extension ``.yaml``/``.yml``
pour une configuration, ``.csv`` pour eval.csv.
"""

from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path

if __package__ in (None, ""):  # lancé comme script : rendre le dépôt importable
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import yaml  # noqa: E402

from sim.track import SCHEMA as TRACK_SCHEMA  # noqa: E402
from sim.track import SPLITS, Track  # noqa: E402

# Version 1.1 du contrat (21/11/2026) : ajout des algorithmes tabulaires sarsa et montecarlo.
# Les fichiers en 1.0 restent valides, mais seulement avec les algorithmes de la 1.0.
REPLAY_SCHEMA = "f1rl.replay/1.1"
CONFIG_SCHEMA = "f1rl.config/1.1"
ALGOS_1_0 = ("qlearning", "dqn", "ppo", "sac", "classic")
ALGOS = ALGOS_1_0 + ("sarsa", "montecarlo")
OUTCOMES = ("lap", "off_track", "timeout", "stalled")
MU_MODES = ("fixed", "uniform")
ACTION_SPACES = ("continuous", "discrete9")
# Espace d'actions imposé par l'algorithme (le pilote classique n'en dépend pas)
ALGO_ACTION_SPACE = {"qlearning": "discrete9", "sarsa": "discrete9", "montecarlo": "discrete9",
                     "dqn": "discrete9", "ppo": "continuous", "sac": "continuous"}
TABULAR_ALGOS = ("qlearning", "sarsa", "montecarlo")  # table Q sauvegardée en .npy

FRAME_NUMBERS = ("t", "x", "y", "psi", "v", "delta", "progress", "reward")
SUMMARY_FIELDS = ("outcome", "lap_time", "total_reward", "steps", "off_tracks")
ENV_FIELDS = ("dt", "action_repeat", "action_space", "max_steps", "stall_steps", "observe_mu")
REWARD_FIELDS = ("k_progress", "c_time", "p_offtrack", "b_lap", "lambda_steer")
EVAL_COLUMNS = (
    "run_id", "algo", "seed", "mu_mode", "checkpoint", "track_id", "split", "mu_factor", "episode",
    "outcome", "lap_time", "total_reward", "steps", "offtracks", "replay_path",
)


def _require(cond: bool, message: str) -> None:
    if not cond:
        raise ValueError(message)


def _is_number(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def _is_int(x) -> bool:
    return isinstance(x, int) and not isinstance(x, bool)


def _check_fields(data: dict, fields, where: str) -> None:
    _require(isinstance(data, dict), f"{where} must be an object")
    missing = [f for f in fields if f not in data]
    _require(not missing, f"{where}: missing fields {missing}")


def _check_schema(schema, algo: str, current: str) -> None:
    """Accept the current version, or version 1.0 with an algorithm that existed in 1.0."""
    old = current.rsplit("/", 1)[0] + "/1.0"
    _require(schema in (current, old), f"unknown schema {schema!r}, expected {current!r}")
    _require(schema == current or algo in ALGOS_1_0, f"algo {algo!r} needs schema {current!r}")


def _check_lap_time(outcome: str, lap_time, where: str) -> None:
    """lap_time is a positive number for a valid lap, and null otherwise."""
    if outcome == "lap":
        _require(_is_number(lap_time) and lap_time > 0, f"{where}: lap_time must be > 0 for a lap")
    else:
        _require(lap_time is None, f"{where}: lap_time must be null when outcome is {outcome!r}")


# --- track.json ---


def validate_track(data: dict) -> None:
    Track(data)  # le chargement d'un circuit applique toutes les règles du contrat


# --- replay.json ---


def validate_replay(data: dict) -> None:
    _check_fields(data, ("schema", "run_id", "agent", "track_id", "mu_factor", "seed", "dt", "frames", "summary"), "replay")
    _require(isinstance(data["run_id"], str) and data["run_id"], "run_id must be a non-empty string")
    _require(isinstance(data["track_id"], str) and data["track_id"], "track_id must be a non-empty string")
    _require(_is_number(data["mu_factor"]) and data["mu_factor"] > 0, "mu_factor must be > 0")
    _require(_is_int(data["seed"]), "seed must be an integer")
    _require(_is_number(data["dt"]) and data["dt"] > 0, "dt must be > 0")

    agent = data["agent"]
    _check_fields(agent, ("algo", "checkpoint", "train_steps"), "agent")
    _require(agent["algo"] in ALGOS, f"agent.algo must be one of {ALGOS}")
    _check_schema(data["schema"], agent["algo"], REPLAY_SCHEMA)
    _require(_is_int(agent["train_steps"]) and agent["train_steps"] >= 0, "agent.train_steps must be an integer >= 0")

    if "network" in data:  # absent pour le pilote classique et le Q-Learning
        net = data["network"]
        _check_fields(net, ("layers", "activation"), "network")
        _require(isinstance(net["layers"], list) and all(_is_int(n) and n > 0 for n in net["layers"]),
                 "network.layers must be a list of positive integers")

    frames = data["frames"]
    _require(isinstance(frames, list) and frames, "frames must be a non-empty list")
    for k, frame in enumerate(frames):
        where = f"frames[{k}]"
        _check_fields(frame, FRAME_NUMBERS + ("action", "obs", "sensors_m", "checkpoint", "slip", "off_track"), where)
        _require(all(_is_number(frame[f]) for f in FRAME_NUMBERS), f"{where}: {FRAME_NUMBERS} must be numbers")
        _check_fields(frame["action"], ("steer", "throttle", "brake"), f"{where}.action")
        _require(all(_is_number(v) for v in frame["action"].values()), f"{where}.action values must be numbers")
        _require(isinstance(frame["obs"], list) and all(_is_number(v) for v in frame["obs"]), f"{where}.obs must be numbers")
        _require(isinstance(frame["sensors_m"], list) and len(frame["sensors_m"]) == 7
                 and all(_is_number(v) and v >= 0 for v in frame["sensors_m"]), f"{where}.sensors_m must be 7 distances")
        _require(_is_int(frame["checkpoint"]) and frame["checkpoint"] >= 0, f"{where}.checkpoint must be an integer >= 0")
        _require(isinstance(frame["slip"], bool) and isinstance(frame["off_track"], bool), f"{where}: slip/off_track must be booleans")
        if "activations" in frame:
            _require(isinstance(frame["activations"], list)
                     and all(isinstance(layer, list) and all(_is_number(v) for v in layer) for layer in frame["activations"]),
                     f"{where}.activations must be a list of lists of numbers")
        if k > 0:
            _require(frame["t"] > frames[k - 1]["t"], f"{where}: t must be increasing")

    summary = data["summary"]
    _check_fields(summary, SUMMARY_FIELDS, "summary")
    _require(summary["outcome"] in OUTCOMES, f"summary.outcome must be one of {OUTCOMES}")
    _check_lap_time(summary["outcome"], summary["lap_time"], "summary")
    _require(_is_number(summary["total_reward"]), "summary.total_reward must be a number")
    _require(summary["steps"] == len(frames), "summary.steps must equal the number of frames")
    _require(_is_int(summary["off_tracks"]) and summary["off_tracks"] >= 0, "summary.off_tracks must be an integer >= 0")


# --- config.yaml ---


def validate_config(cfg: dict) -> None:
    fields = ("schema", "algo", "seed", "total_steps", "n_envs", "tracks", "mu", "env", "reward",
              "hyperparams", "checkpoint_every", "eval_every", "eval_episodes")
    _check_fields(cfg, fields, "config")
    _require(cfg["algo"] in ALGOS, f"algo must be one of {ALGOS}")
    _check_schema(cfg["schema"], cfg["algo"], CONFIG_SCHEMA)
    _require(_is_int(cfg["seed"]) and cfg["seed"] >= 0, "seed must be an integer >= 0")
    for f in ("total_steps", "n_envs", "checkpoint_every", "eval_every", "eval_episodes"):
        _require(_is_int(cfg[f]) and cfg[f] > 0, f"{f} must be a positive integer")

    tracks = cfg["tracks"]
    _check_fields(tracks, ("train", "test"), "tracks")
    for split in ("train", "test"):
        _require(isinstance(tracks[split], list) and all(isinstance(t, str) for t in tracks[split]),
                 f"tracks.{split} must be a list of track ids")
    _require(tracks["train"], "tracks.train must not be empty")

    mu = cfg["mu"]
    _check_fields(mu, ("mode", "value", "range"), "mu")
    _require(mu["mode"] in MU_MODES, f"mu.mode must be one of {MU_MODES}")
    _require(_is_number(mu["value"]) and mu["value"] > 0, "mu.value must be > 0")
    rng = mu["range"]
    _require(isinstance(rng, list) and len(rng) == 2 and all(_is_number(v) for v in rng) and 0 < rng[0] <= rng[1],
             "mu.range must be [low, high] with 0 < low <= high")

    env = cfg["env"]
    _check_fields(env, ENV_FIELDS, "env")
    _require(_is_number(env["dt"]) and env["dt"] > 0, "env.dt must be > 0")
    for f in ("action_repeat", "max_steps", "stall_steps"):
        _require(_is_int(env[f]) and env[f] > 0, f"env.{f} must be a positive integer")
    _require(env["action_space"] in ACTION_SPACES, f"env.action_space must be one of {ACTION_SPACES}")
    _require(isinstance(env["observe_mu"], bool), "env.observe_mu must be true or false")
    expected = ALGO_ACTION_SPACE.get(cfg["algo"])
    _require(expected is None or env["action_space"] == expected,
             f"algo {cfg['algo']} needs env.action_space = {expected}")

    reward = cfg["reward"]
    _check_fields(reward, REWARD_FIELDS, "reward")
    _require(all(_is_number(reward[f]) and reward[f] >= 0 for f in REWARD_FIELDS), "reward values must be numbers >= 0")
    _require(isinstance(cfg["hyperparams"], dict), "hyperparams must be a mapping")


# --- eval.csv ---


def validate_eval_rows(rows: list[dict], columns: list[str]) -> None:
    _require(tuple(columns) == EVAL_COLUMNS, f"columns must be exactly {list(EVAL_COLUMNS)}")
    for k, row in enumerate(rows, start=2):  # ligne 1 = en-tête
        where = f"line {k}"
        _require(row["algo"] in ALGOS, f"{where}: algo must be one of {ALGOS}")
        _require(row["mu_mode"] in MU_MODES, f"{where}: mu_mode must be one of {MU_MODES}")
        _require(row["split"] in SPLITS, f"{where}: split must be one of {SPLITS}")
        _require(row["outcome"] in OUTCOMES, f"{where}: outcome must be one of {OUTCOMES}")
        try:
            for f in ("seed", "episode", "steps", "offtracks"):
                int(row[f])
            float(row["mu_factor"])
            float(row["total_reward"])
            lap_time = float(row["lap_time"]) if row["lap_time"] != "" else None
        except ValueError as exc:
            raise ValueError(f"{where}: {exc}") from None
        _check_lap_time(row["outcome"], lap_time, where)


# --- Point d'entrée ---


def validate_file(path: str | Path) -> str:
    """Validate one file; return its detected kind, raise ValueError if invalid."""
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix in (".yaml", ".yml"):
        with open(path, encoding="utf-8") as f:
            validate_config(yaml.safe_load(f))
        return "config"
    if suffix == ".csv":
        with open(path, encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            validate_eval_rows(rows, reader.fieldnames or [])
        return "eval"
    if suffix == ".json":
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        schema = data.get("schema") if isinstance(data, dict) else None
        if schema == TRACK_SCHEMA:
            validate_track(data)
            return "track"
        if schema in (REPLAY_SCHEMA, "f1rl.replay/1.0"):
            validate_replay(data)
            return "replay"
        raise ValueError(f"unknown schema {schema!r}")
    raise ValueError(f"unsupported file type {suffix!r}")


def main(argv: list[str] | None = None) -> int:
    paths = sys.argv[1:] if argv is None else argv
    if not paths:
        print("usage : python tools/validate.py <fichier> [<fichier> ...]", file=sys.stderr)
        return 2
    failed = 0
    for path in paths:
        try:
            kind = validate_file(path)
            print(f"OK      {path} ({kind})")
        except (ValueError, KeyError, TypeError, OSError, json.JSONDecodeError, yaml.YAMLError) as exc:
            failed += 1
            print(f"INVALIDE {path} : {exc}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
