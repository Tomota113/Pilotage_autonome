import { useEffect, useState } from "react";
import { listReplays } from "../data/api.js";
import { usePlayback } from "../playback.jsx";

export function replayLabel(r) {
  const lap = r.lap_time !== "" && r.lap_time != null ? `${Number(r.lap_time).toFixed(2)} s` : r.outcome;
  return `${r.run_id} · ${r.algo} · ${r.track_id} · μ ${Number(r.mu_factor).toFixed(2)} · ${lap}`;
}

// Liste déroulante des replays disponibles (lignes de eval.csv avec un replay_path)
export default function ReplayPicker() {
  const { entry, select, error } = usePlayback();
  const [replays, setReplays] = useState(null);
  useEffect(() => { listReplays().then(setReplays).catch(() => setReplays([])); }, []);
  if (replays === null) return <p className="note">Chargement de la liste des replays…</p>;
  if (replays.length === 0)
    return <p className="empty">Aucun replay : lancer <code>python -m agents.evaluate</code> ou <code>tools/evaluate_all.py</code>.</p>;
  return (
    <div className="controls">
      <select value={entry?.path ?? ""} onChange={(e) => select(replays.find((r) => r.path === e.target.value))}
              style={{ maxWidth: "100%" }} aria-label="Replay">
        <option value="" disabled>Choisir un replay…</option>
        {replays.map((r) => <option key={r.path} value={r.path}>{replayLabel(r)}</option>)}
      </select>
      {error && <span className="warn">{error}</span>}
    </div>
  );
}
