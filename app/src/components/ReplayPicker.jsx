// Choix d'un replay en trois menus lisibles : agent (condition), circuit, adhérence.
// `onlyWithActivations` limite la liste aux replays de réseaux de neurones (Neural Network Explorer).
import { useEffect, useMemo } from "react";
import { CONDITIONS, OUTCOME_LABELS, conditionLabel, muLabel } from "../data/algorithms.js";
import { usePlayback } from "../playback.jsx";
import TrackOptions from "./TrackOptions.jsx";

export { replayTitle as replayLabel } from "../data/algorithms.js";

const ORDER = Object.fromEntries(CONDITIONS.map((c, i) => [c.id, i]));

function pickDefault(list) {
  return list.find((r) => ["sac_mufixe", "sac_f1"].includes(r.condition) && r.mu_factor === 1) ?? list[0];
}

export function ReplayFields({ replays, onlyWithActivations = false, autoSelect = true, children }) {
  const { entry, select, error } = usePlayback();
  const conditions = useMemo(() => [...new Set((replays ?? []).map((r) => r.condition ?? ""))]
    .sort((a, b) => (ORDER[a] ?? 99) - (ORDER[b] ?? 99)), [replays]);

  const current = entry && replays?.some((r) => r.path === entry.path) ? entry : null;
  const condition = current?.condition ?? conditions[0] ?? "";
  const ofCondition = (replays ?? []).filter((r) => (r.condition ?? "") === condition);
  const tracks = [...new Set(ofCondition.map((r) => r.track_id))].sort();
  const track = current?.track_id ?? tracks[0];
  const ofTrack = ofCondition.filter((r) => r.track_id === track);
  const mus = [...new Set(ofTrack.map((r) => r.mu_factor))].sort((a, b) => b - a);

  // Premier affichage : un replay est choisi automatiquement
  useEffect(() => {
    if (autoSelect && !current && replays?.length) select(pickDefault(replays));
  }, [autoSelect, current, replays, select]);

  function choose(cond, trk, mu) {
    const pool = replays.filter((r) => (r.condition ?? "") === cond);
    const byTrack = pool.filter((r) => r.track_id === trk);
    const candidates = byTrack.length ? byTrack : pool;
    const next = candidates.find((r) => r.mu_factor === mu) ?? candidates.find((r) => r.mu_factor === 1) ?? candidates[0];
    if (next) select(next);
  }

  if (!replays?.length) {
    return <div className="controls">
      {children}
      {replays === null ? <p className="note" role="status">Chargement des replays…</p>
        : <p className="empty">Aucun replay{onlyWithActivations ? " avec activations" : " pour cette voiture"}.</p>}
    </div>;
  }
  return (
    <div className="controls replay-fields">
      {children}
      <label className="field">Agent
        <select value={condition} onChange={(e) => choose(e.target.value, track, current?.mu_factor ?? 1)}>
          {conditions.map((c) => <option key={c} value={c}>{conditionLabel(c || null)}</option>)}
        </select>
      </label>
      <label className="field">Circuit
        <select value={track} onChange={(e) => choose(condition, e.target.value, current?.mu_factor ?? 1)}>
          <TrackOptions ids={tracks} />
        </select>
      </label>
      <label className="field">Adhérence
        <select value={current?.mu_factor ?? ""} onChange={(e) => choose(condition, track, Number(e.target.value))}>
          {mus.map((m) => <option key={m} value={m}>{muLabel(m)}</option>)}
        </select>
      </label>
      {current && (
        <span className={`chip ${current.outcome === "lap" ? "good" : "bad"}`} style={{ alignSelf: "flex-end", marginBottom: 6 }}>
          {current.outcome === "lap" && current.lap_time != null
            ? `Tour bouclé en ${Number(current.lap_time).toFixed(1)} s`
            : OUTCOME_LABELS[current.outcome] ?? current.outcome}
        </span>
      )}
      {current && error && <span className="warn" role="alert">{error}</span>}
    </div>
  );
}
