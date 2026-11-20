"""Child process entry points for the Training Center."""

import json
import os
import sys
from pathlib import Path

from env.f1_env import F1Env, load_tracks


def watch(checkpoint: str, track_id: str, mu_factor: str) -> None:
    from agents.evaluate import load_policy, run_episode

    policy, config, _ = load_policy(checkpoint)
    env = F1Env(config, load_tracks([track_id], Path.cwd() / "tracks"))
    frames, summary = run_episode(env, policy, track_id, float(mu_factor), config["seed"])
    for frame in frames:
        print(json.dumps({"type": "frame", **frame}, allow_nan=False), flush=True)
    print(json.dumps({"type": "episode_end", "summary": summary}, allow_nan=False), flush=True)


if __name__ == "__main__":
    mode = sys.argv.pop(1)
    if mode == "watch":
        try:
            os.nice(10)
            watch(*sys.argv[1:])
        except Exception as exc:
            print(json.dumps({"type": "error", "message": str(exc)}), flush=True)
