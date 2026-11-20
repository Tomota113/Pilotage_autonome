import { useEffect, useMemo, useState } from "react";
import TrackCanvas from "../components/TrackCanvas.jsx";
import { replayLabel } from "../components/ReplayPicker.jsx";
import { listReplays, listTracks, loadReplay, loadTrack } from "../data/api.js";
import { SPEEDS } from "../playback.jsx";

// Couleur fixe par position dans la sélection (palette catégorielle validée pour le daltonisme)
const COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9", "#e66767"];

function ranking(entries) {
  // Tours valides d'abord (temps croissant), puis les autres selon la progression atteinte
  return [...entries].sort((a, b) => {
    const la = a.replay.summary.lap_time, lb = b.replay.summary.lap_time;
    if (la != null && lb != null) return la - lb;
    if (la != null) return -1;
    if (lb != null) return 1;
    return b.replay.frames.at(-1).progress - a.replay.frames.at(-1).progress;
  });
}

export default function Championship() {
  const [tracks, setTracks] = useState([]);
  const [trackId, setTrackId] = useState("");
  const [track, setTrack] = useState(null);
  const [available, setAvailable] = useState([]);
  const [selected, setSelected] = useState([]); // [{entry, replay, color}]
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showTrails, setShowTrails] = useState(true);

  useEffect(() => { listTracks().then(setTracks).catch(() => setTracks([])); }, []);
  useEffect(() => {
    if (!trackId) return;
    setSelected([]);
    setTime(0);
    loadTrack(trackId).then(setTrack);
    listReplays().then((all) => setAvailable(all.filter((r) => r.track_id === trackId)));
  }, [trackId]);

  const duration = useMemo(() => Math.max(0, ...selected.map((s) => s.replay.frames.at(-1).t)), [selected]);
  useEffect(() => {
    if (!playing) return undefined;
    let raf, last = null;
    const tick = (now) => {
      if (last !== null) setTime((t) => Math.min(duration, t + ((now - last) / 1000) * speed));
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration]);
  useEffect(() => { if (time >= duration) setPlaying(false); }, [time, duration]);

  async function toggle(entry) {
    if (selected.some((s) => s.entry.path === entry.path)) {
      setSelected(selected.filter((s) => s.entry.path !== entry.path));
      return;
    }
    const replay = await loadReplay(entry.path);
    const used = new Set(selected.map((s) => s.color));
    const color = COLORS.find((c) => !used.has(c)) ?? COLORS[0];
    setSelected([...selected, { entry, replay, color }]);
  }

  // Image de chaque voiture à l'instant t (la dernière si son épisode est fini)
  const cars = selected.map((s) => {
    const i = Math.min(s.replay.frames.length - 1, Math.max(0, Math.floor(time / s.replay.dt)));
    const f = s.replay.frames[i];
    return { x: f.x, y: f.y, psi: f.psi, color: s.color };
  });
  const trails = showTrails
    ? selected.map((s) => ({ points: s.replay.frames.map((f) => [f.x, f.y]), color: s.color, alpha: 0.6 }))
    : [];

  return (
    <>
      <h2>AI Championship</h2>
      <p className="subtitle">Plusieurs replays du même circuit superposés (voitures fantômes) et classés par temps au tour.</p>
      <div className="controls">
        <select value={trackId} onChange={(e) => setTrackId(e.target.value)} aria-label="Circuit">
          <option value="" disabled>Choisir un circuit…</option>
          {tracks.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.id}, {t.split})</option>)}
        </select>
      </div>
      {trackId && available.length === 0 && <p className="empty">Aucun replay sur ce circuit.</p>}
      {available.length > 0 && (
        <div className="row">
          <div className="grow panel">
            <TrackCanvas track={track} cars={cars} trails={trails} />
            <div className="controls">
              <button onClick={() => { if (time >= duration) setTime(0); setPlaying(!playing); }} disabled={!selected.length}>
                {playing ? "Pause" : "Lecture"}
              </button>
              {SPEEDS.map((s) => <button key={s} className={s === speed ? "on" : ""} onClick={() => setSpeed(s)}>×{s}</button>)}
              <input type="range" min={0} max={duration || 1} step={0.05} value={time} style={{ flex: 1, minWidth: 160 }}
                     onChange={(e) => { setPlaying(false); setTime(Number(e.target.value)); }} aria-label="Curseur temporel" />
              <span className="note">{time.toFixed(2)} s</span>
              <label className="note"><input type="checkbox" checked={showTrails} onChange={(e) => setShowTrails(e.target.checked)} /> trajectoires</label>
            </div>
          </div>
          <div className="panel" style={{ width: 380 }}>
            <strong>Participants</strong>
            {available.map((r) => (
              <label key={r.path} style={{ display: "block", fontSize: 13, margin: "4px 0" }}>
                <input type="checkbox" checked={selected.some((s) => s.entry.path === r.path)} onChange={() => toggle(r)} />{" "}
                {replayLabel(r)}
              </label>
            ))}
            {selected.length > 0 && (
              <table style={{ marginTop: 12 }}>
                <thead><tr><th>#</th><th>Agent</th><th className="num">Temps</th><th>Résultat</th></tr></thead>
                <tbody>
                  {ranking(selected).map((s, k) => (
                    <tr key={s.entry.path}>
                      <td>{k + 1}</td>
                      <td><span className="swatch" style={{ background: s.color }} />{s.replay.run_id} ({s.replay.agent.algo}, μ×{s.replay.mu_factor})</td>
                      <td className="num">{s.replay.summary.lap_time != null ? `${s.replay.summary.lap_time.toFixed(2)} s` : "—"}</td>
                      <td>{s.replay.summary.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}
