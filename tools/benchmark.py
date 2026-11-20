"""Measure the simulator throughput (decisions per second) on this computer.

Usage : ``python -m tools.benchmark [--track gen_00] [--steps 20000]``

Un « pas » = une décision de l'agent : physique de la voiture (5 sous-pas de
0,01 s), projection sur la ligne centrale et lecture des 7 capteurs. C'est le
travail du simulateur à chaque appel de ``env.step`` ; le temps du réseau de
neurones et de l'algorithme d'apprentissage s'y ajoute pendant l'entraînement.

La voiture est conduite par un régulateur très simple (cap vers la piste,
vitesse modérée) et replacée au départ si elle sort : on mesure un usage
réaliste, avec la projection fenêtrée qui suit la voiture.
"""

from __future__ import annotations

import argparse
import math
import platform
import time
from pathlib import Path

from sim.car import CarState, step
from sim.sensors import read_sensors
from sim.track import Track

TRACKS_DIR = Path(__file__).resolve().parent.parent / "tracks"


def cpu_name() -> str:
    """Processor model (from /proc/cpuinfo on Linux), to know where a measurement comes from."""
    try:
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.startswith("model name"):
                return line.split(":", 1)[1].strip()
    except OSError:
        pass
    return platform.processor() or platform.machine()


def run(track: Track, n_steps: int) -> dict:
    """Simulate n_steps decisions; return the time spent in each part (s)."""
    x, y, psi = track.start_pose()
    state = CarState(x=x, y=y, psi=psi)
    index = track.start_index
    t_car = t_proj = t_sens = 0.0
    resets = 0
    steer = 0.0
    for _ in range(n_steps):
        t0 = time.perf_counter()
        state, _ = step(state, (steer, 0.6 if state.v < 20.0 else 0.0, 0.0), mu=1.0)
        t1 = time.perf_counter()
        pos = track.project(state.x, state.y, hint_index=index)
        index = pos.index
        t2 = time.perf_counter()
        read_sensors(track, state.x, state.y, state.psi, index=index)
        t3 = time.perf_counter()
        t_car, t_proj, t_sens = t_car + t1 - t0, t_proj + t2 - t1, t_sens + t3 - t2

        # Régulateur : corrige l'écart de cap et l'écart latéral
        heading_error = math.atan2(math.sin(pos.heading - state.psi), math.cos(pos.heading - state.psi))
        steer = max(-1.0, min(1.0, 3.0 * heading_error - 0.1 * pos.lateral))
        if track.is_off_track(pos):
            resets += 1
            x, y, psi = track.start_pose()
            state, index = CarState(x=x, y=y, psi=psi), track.start_index
    return {"car": t_car, "projection": t_proj, "sensors": t_sens, "resets": resets}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--track", default="gen_00", help="track id in tracks/ (default: gen_00)")
    parser.add_argument("--steps", type=int, default=20000, help="number of decisions (default: 20000)")
    args = parser.parse_args()

    track = Track.from_json(TRACKS_DIR / f"{args.track}.json")
    run(track, 200)  # échauffement (caches, allocations)
    t = run(track, args.steps)
    total = t["car"] + t["projection"] + t["sensors"]

    print(f"Machine : {cpu_name()} — Python {platform.python_version()}")
    print(f"Circuit : {track.id} ({track.length:.0f} m, {len(track.points)} points), {args.steps} pas")
    for part in ("car", "projection", "sensors"):
        print(f"  {part:11s} {1e6 * t[part] / args.steps:7.1f} µs/pas  ({100 * t[part] / total:4.1f} %)")
    print(f"Débit simulateur : {args.steps / total:,.0f} pas/s".replace(",", " "))
    print(f"(sorties de piste du régulateur pendant la mesure : {t['resets']})")


if __name__ == "__main__":
    main()
