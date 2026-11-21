// Choix d'un replay en trois menus lisibles : agent (condition), circuit, adhérence.
// `onlyWithActivations` limite la liste aux replays de réseaux de neurones (Neural Network Explorer).
import { useEffect, useMemo, useState } from "react";
import { CONDITIONS, OUTCOME_LABELS, conditionLabel, muLabel } from "../data/algorithms.js";
import { listReplays } from "../data/api.js";
import { usePlayback } from "../playback.jsx";
import TrackOptions from "./TrackOptions.jsx";

export { replayTitle as replayLabel } from "../data/algorithms.js";

const ORDER = Object.fromEntries(CONDITIONS.map((c, i) => [c.id, i]));

function pickDefault(list) {
  // Par défaut : SAC (meilleur agent) sur le premier circuit de test, adhérence normale, sinon le premier
  return list.find((r) => r.condition === "sac_mufixe" && r.mu_factor === 1) ?? list[0];
}

export default function ReplayPicker({ onlyWithActivations = false }) {
  const { entry, select, error } = usePlayback();
  const [all, setAll] = useState(null);
  useEffect(() => { listReplays().then(setAll).catch(() => setAll([])); }, []);

  const replays = useMemo(() => (all ?? []).filter((r) => (!onlyWithActivations || r.has_activations)), [all, onlyWithActivations]);
  const conditions = useMemo(() => [...new Set(replays.map((r) => r.condition ?? ""))]
    .sort((a, b) => (ORDER[a] ?? 99) - (ORDER[b] ?? 99)), [replays]);

  const current = entry && replays.some((r) => r.path === entry.path) ? entry : null;
  const condition = current?.condition ?? conditions[0] ?? "";
  const ofCondition = replays.filter((r) => (r.condition ?? "") === condition);
  const tracks = [...new Set(ofCondition.map((r) => r.track_id))].sort();
  const track = current?.track_id ?? tracks[0];
  const ofTrack = ofCondition.filter((r) => r.track_id === track);
  const mus = [...new Set(ofTrack.map((r) => r.mu_factor))].sort((a, b) => b - a);

  // Premier affichage : un replay est choisi automatiquement
  useEffect(() => {
    if (!current && replays.length) select(pickDefault(replays));
  }, [current, replays, select]);

  function choose(cond, trk, mu) {
    const pool = replays.filter((r) => (r.condition ?? "") === cond);
    const byTrack = pool.filter((r) => r.track_id === trk);
    const candidates = byTrack.length ? byTrack : pool;
    const next = candidates.find((r) => r.mu_factor === mu) ?? candidates.find((r) => r.mu_factor === 1) ?? candidates[0];
    if (next) select(next);
  }

  if (all === null) return <p className="note">Chargement des replays…</p>;
  if (replays.length === 0) {
    return (
      <p className="empty">
        Aucun replay{onlyWithActivations ? " avec activations" : ""} : lancer <code>python -m tools.make_showcase</code>.
      </p>
    );
  }
  const shown = current;
  return (
    <div className="controls">
      <label className="field">Agent
        <select value={condition} onChange={(e) => choose(e.target.value, track, shown?.mu_factor ?? 1)}>
          {conditions.map((c) => <option key={c} value={c}>{conditionLabel(c || null)}</option>)}
        </select>
      </label>
      <label className="field">Circuit
        <select value={track} onChange={(e) => choose(condition, e.target.value, shown?.mu_factor ?? 1)}>
          <TrackOptions ids={tracks} />
        </select>
      </label>
      <label className="field">Adhérence
        <select value={shown?.mu_factor ?? ""} onChange={(e) => choose(condition, track, Number(e.target.value))}>
          {mus.map((m) => <option key={m} value={m}>{muLabel(m)}</option>)}
        </select>
      </label>
      {shown && (
        <span className={`chip ${shown.outcome === "lap" ? "good" : "bad"}`} style={{ alignSelf: "flex-end", marginBottom: 6 }}>
          {shown.outcome === "lap" && shown.lap_time != null
            ? `Tour bouclé en ${Number(shown.lap_time).toFixed(1)} s`
            : OUTCOME_LABELS[shown.outcome] ?? shown.outcome}
        </span>
      )}
      {error && <span className="warn">{error}</span>}
    </div>
  );
}
