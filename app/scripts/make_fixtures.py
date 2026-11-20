"""Write the FAKE development data of the app: public/fixtures/fixture_*.json.

Données SYNTHÉTIQUES (aucune simulation, aucun entraînement) : une voiture qui
suit la ligne centrale d'un ovale avec une vitesse inventée, des observations
et des activations calculées par des sinus. Elles servent seulement à
développer l'interface sans serveur ; l'application les marque « FIXTURE ».

Usage (depuis la racine du dépôt) : python app/scripts/make_fixtures.py
"""

import json
import math
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "fixtures"
DT = 0.05


def oval(straight=200.0, radius=50.0, spacing=5.0):
    pts, half = [], straight / 2
    n_s, n_c = int(straight / spacing), int(math.pi * radius / spacing)
    pts += [[-half + k * straight / n_s, -radius] for k in range(n_s)]
    pts += [[half + radius * math.sin(math.pi * k / n_c), -radius * math.cos(math.pi * k / n_c)] for k in range(n_c)]
    pts += [[half - k * straight / n_s, radius] for k in range(n_s)]
    pts += [[-half - radius * math.sin(math.pi * k / n_c), radius * math.cos(math.pi * k / n_c)] for k in range(n_c)]
    return [[round(x, 3), round(y, 3)] for x, y in pts]


def track():
    c = oval()
    n = len(c)
    length = sum(math.dist(c[i], c[(i + 1) % n]) for i in range(n))
    return {"schema": "f1rl.track/1.0", "id": "fixture_oval", "name": "FIXTURE ovale", "split": "demo", "seed": None,
            "centerline": c, "width": [12.0] * n, "mu": [1.0] * n, "start": {"index": 0, "heading": 0.0},
            "checkpoints": [k * n // 20 for k in range(20)], "length": round(length, 1)}


def replay(trk, run_id, algo, speed_scale, lateral, with_acts):
    c, n = trk["centerline"], len(trk["centerline"])
    frames, s, t, k = [], 0.0, 0.0, 0
    seg = [math.dist(c[i], c[(i + 1) % n]) for i in range(n)]
    total = sum(seg)
    i, along = 0, 0.0
    while s < total:
        x0, y0 = c[i]
        x1, y1 = c[(i + 1) % n]
        psi = math.atan2(y1 - y0, x1 - x0)
        u = along / seg[i]
        bend = abs(y0) < 49.0  # dans les virages de l'ovale
        v = speed_scale * (20.0 if bend else 38.0)
        off = lateral * math.sin(0.02 * k)
        x = x0 + u * (x1 - x0) - off * math.sin(psi)
        y = y0 + u * (y1 - y0) + off * math.cos(psi)
        steer = 0.3 if bend else 0.0
        t += DT
        frame = {"t": round(t, 3), "x": round(x, 3), "y": round(y, 3), "psi": round(psi, 4), "v": round(v, 3),
                 "delta": round(0.4 * steer, 4),
                 "action": {"steer": steer, "throttle": 0.3 if bend else 1.0, "brake": 0.0},
                 "obs": [round(math.sin(0.05 * k + j), 3) * 0.5 + 0.5 if j < 7 else round(math.sin(0.03 * k + j), 3)
                         for j in range(12)],
                 "sensors_m": [round(6.0 / max(0.2, abs(math.sin(math.radians(a)))), 2) if a else 60.0
                               for a in (-90, -60, -30, 0, 30, 60, 90)],
                 "progress": round(s / total, 4), "checkpoint": min(19, int(20 * s / total)),
                 "reward": round(0.1 * v * DT - 0.01, 4), "slip": False, "off_track": False}
        if with_acts:
            frame["activations"] = [[round(math.tanh(math.sin(0.04 * k + 0.3 * j + layer)), 3) for j in range(64)]
                                    for layer in range(2)]
        frames.append(frame)
        step = v * DT
        s += step
        along += step
        while along >= seg[i] and s < total:
            along -= seg[i]
            i = (i + 1) % n
        k += 1
    lap_time = round(len(frames) * DT, 2)
    data = {"schema": "f1rl.replay/1.0", "run_id": run_id,
            "agent": {"algo": algo, "checkpoint": "step_0" if algo != "classic" else "none", "train_steps": 0},
            "track_id": "fixture_oval", "mu_factor": 1.0, "seed": 0, "dt": DT}
    if with_acts:
        data["network"] = {"layers": [12, 64, 64, 3], "activation": "tanh"}
    data.update(frames=frames, summary={"outcome": "lap", "lap_time": lap_time,
                                        "total_reward": round(sum(f["reward"] for f in frames), 3),
                                        "steps": len(frames), "off_tracks": 0})
    return data


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    trk = track()
    replays = [("fixture_replay_a.json", replay(trk, "fixture_a", "ppo", 1.0, 2.0, True)),
               ("fixture_replay_b.json", replay(trk, "fixture_b", "classic", 0.9, 0.5, False))]
    files = {"fixture_track_oval.json": trk, **dict(replays)}
    files["fixture_eval.json"] = [
        {"run_id": r, "algo": a, "seed": 0, "mu_mode": "fixed", "checkpoint": "step_0", "track_id": "fixture_oval",
         "split": sp, "mu_factor": mu, "episode": 0, "outcome": o, "lap_time": lt, "total_reward": tr,
         "steps": 0, "offtracks": int(o == "off_track"), "replay_path": ""}
        for r, a, sp, mu, o, lt, tr in [
            ("fixture_a", "ppo", "test", 1.0, "lap", 41.2, 120.0), ("fixture_a", "ppo", "test", 0.6, "off_track", "", 12.0),
            ("fixture_b", "classic", "test", 1.0, "lap", 44.0, 115.0), ("fixture_b", "classic", "test", 0.6, "lap", 52.0, 110.0)]]
    files["fixture_progress_a.json"] = [
        {"run_id": "fixture_a", "algo": "ppo", "seed": 0, "mu_mode": "fixed", "step": 50000 * k, "wall_time_s": 40 * k,
         "mean_reward": round(100 * (1 - math.exp(-k / 4)), 2), "std_reward": 5.0, "lap_rate": round(min(1, k / 10), 2),
         "mean_lap_time": "", "offtracks_per_ep": round(max(0, 1 - k / 10), 2)} for k in range(1, 21)]
    files["fixture_manifest.json"] = {
        "note": "Données FACTICES de développement (app/scripts/make_fixtures.py). Jamais montrées en démo.",
        "tracks": [{"id": "fixture_oval", "name": "FIXTURE ovale", "split": "demo", "file": "fixture_track_oval.json"}],
        "replays": [{"path": name, "run_id": d["run_id"], "algo": d["agent"]["algo"], "track_id": "fixture_oval",
                     "mu_factor": 1.0, "outcome": "lap", "lap_time": d["summary"]["lap_time"]} for name, d in replays],
        "eval": "fixture_eval.json",
        "runs": [{"run_id": "fixture_a", "algo": "ppo", "seed": 0, "state": "finished", "step": 1000000}],
        "progress": {"fixture_a": "fixture_progress_a.json"},
    }
    for name, data in files.items():
        (OUT / name).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        print(OUT / name)


if __name__ == "__main__":
    main()
