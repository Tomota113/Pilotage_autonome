import { useEffect, useMemo, useState } from "react";
import TrackCanvas from "../components/TrackCanvas.jsx";
import { CONDITIONS, OUTCOME_LABELS, conditionColor, conditionLabel } from "../data/algorithms.js";
import { listReplays, loadReplay, loadTrack } from "../data/api.js";
import { SPEEDS } from "../playback.jsx";

const ORDER = Object.fromEntries(CONDITIONS.map((c, i) => [c.id, i]));
const MUS = [1, 0.8, 0.6];

// Pour un agent : sa meilleure course sur ce circuit et cette adhérence (tour bouclé le plus rapide, sinon la plus longue)
function bestOf(list) {
  return [...list].sort((a, b) => {
    const la = a.outcome === "lap" ? a.lap_time : Infinity;
    const lb = b.outcome === "lap" ? b.lap_time : Infinity;
    return la - lb;
  })[0];
}

function frameAt(replay, t) {
  return replay.frames[Math.min(replay.frames.length - 1, Math.max(0, Math.floor(t / replay.dt)))];
}

export default function Championship() {
  const [all, setAll] = useState(null);
  const [trackId, setTrackId] = useState(null);
  const [mu, setMu] = useState(1);
  const [track, setTrack] = useState(null);
  const [racers, setRacers] = useState([]); // [{condition, entry, replay}]
  const [hidden, setHidden] = useState(new Set());
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [showTrails, setShowTrails] = useState(false);

  useEffect(() => { listReplays().then(setAll).catch(() => setAll([])); }, []);
  const tracks = useMemo(() => {
    const count = {};
    for (const r of all ?? []) if (r.condition) count[r.track_id] = (count[r.track_id] ?? new Set()).add(r.condition);
    return Object.entries(count).filter(([, s]) => s.size >= 2).map(([t]) => t).sort();
  }, [all]);
  useEffect(() => { if (!trackId && tracks.length) setTrackId(tracks.includes("gen_10") ? "gen_10" : tracks[0]); }, [tracks, trackId]);

  // Chargement du circuit et de la meilleure course de chaque agent
  useEffect(() => {
    if (!trackId || !all) return;
    let cancelled = false;
    setPlaying(false);
    setTime(0);
    loadTrack(trackId).then((t) => !cancelled && setTrack(t));
    const byCondition = {};
    for (const r of all) {
      if (r.track_id === trackId && Number(r.mu_factor) === mu && r.condition) (byCondition[r.condition] ??= []).push(r);
    }
    const entries = Object.entries(byCondition).map(([condition, list]) => ({ condition, entry: bestOf(list) }))
      .sort((a, b) => (ORDER[a.condition] ?? 99) - (ORDER[b.condition] ?? 99));
    Promise.all(entries.map(async (e) => ({ ...e, replay: await loadReplay(e.entry.path) }))).then((loaded) => {
      if (!cancelled) setRacers(loaded);
    });
    return () => { cancelled = true; };
  }, [trackId, mu, all]);

  const visible = racers.filter((r) => !hidden.has(r.condition));
  const duration = useMemo(() => Math.max(0, ...visible.map((r) => r.replay.frames.at(-1).t)), [visible]);

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
  useEffect(() => { if (playing && time >= duration) setPlaying(false); }, [time, duration, playing]);

  // Classement en direct : tour fini d'abord (au temps), puis la plus grande progression à l'instant t
  const live = visible.map((r) => {
    const f = frameAt(r.replay, time);
    const done = time >= r.replay.frames.at(-1).t;
    return { ...r, frame: f, done, finished: done && r.replay.summary.outcome === "lap" };
  }).sort((a, b) => {
    if (a.finished && b.finished) return a.replay.summary.lap_time - b.replay.summary.lap_time;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.frame.progress - a.frame.progress;
  });

  // Pas d'étiquette sur les voitures (elles se chevauchent au départ) : couleur + légende à droite
  const cars = live.map((r) => ({ x: r.frame.x, y: r.frame.y, psi: r.frame.psi, color: conditionColor(r.condition) }));
  const trails = showTrails ? visible.map((r) => ({
    points: r.replay.frames.filter((f) => f.t <= time).map((f) => [f.x, f.y]), color: conditionColor(r.condition), alpha: 0.55,
  })) : [];

  if (all === null) return <p className="note">Chargement…</p>;
  return (
    <>
      <div className="page-header">
        <h2>AI Championship</h2>
        <p>Tous les agents sur le même circuit de test, en même temps : chaque voiture rejoue la meilleure course de son
          algorithme. Le classement se met à jour en direct pendant la lecture.</p>
      </div>
      {tracks.length === 0 ? (
        <p className="empty">Aucun circuit avec plusieurs agents : lancer <code>python -m tools.make_showcase</code>.</p>
      ) : (
        <>
          <div className="controls">
            <label className="field">Circuit
              <select value={trackId ?? ""} onChange={(e) => setTrackId(e.target.value)}>
                {tracks.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <div className="field" style={{ fontSize: 12.5, color: "var(--muted)" }}>Adhérence
              <div className="segmented">
                {MUS.map((m) => (
                  <button key={m} className={m === mu ? "on" : ""} onClick={() => setMu(m)}>
                    {m === 1 ? "Normale" : m === 0.8 ? "Humide" : "Glissante"} (μ {m.toFixed(1).replace(".", ",")})
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="row">
            <div className="grow card" style={{ padding: 10 }}>
              <TrackCanvas track={track} cars={cars} trails={trails} height={580} />
              <div className="controls">
                <button className="primary" onClick={() => { if (time >= duration) setTime(0); setPlaying(!playing); }}
                        disabled={!visible.length}>{playing ? "Pause" : time > 0 && time < duration ? "Reprendre" : "Départ"}</button>
                <div className="segmented">
                  {SPEEDS.map((s) => <button key={s} className={s === speed ? "on" : ""} onClick={() => setSpeed(s)}>×{s}</button>)}
                </div>
                <input type="range" min={0} max={duration || 1} step={0.05} value={time} style={{ flex: 1, minWidth: 160 }}
                       onChange={(e) => { setPlaying(false); setTime(Number(e.target.value)); }} aria-label="Curseur temporel" />
                <span className="note">{time.toFixed(1)} s</span>
                <label className="note"><input type="checkbox" checked={showTrails} onChange={(e) => setShowTrails(e.target.checked)} /> trajectoires</label>
              </div>
            </div>
            <div className="card" style={{ width: 380 }}>
              <div className="card-title">Classement {playing || (time > 0 && time < duration) ? "en direct" : time >= duration && duration > 0 ? "final" : ""}</div>
              <table>
                <thead><tr><th>#</th><th>Agent</th><th className="num">État</th></tr></thead>
                <tbody>
                  {live.map((r, k) => (
                    <tr key={r.condition}>
                      <td>{k + 1}</td>
                      <td><span className="swatch" style={{ background: conditionColor(r.condition) }} />{conditionLabel(r.condition)}</td>
                      <td className="num">
                        {r.finished ? <span className="chip good">{r.replay.summary.lap_time.toFixed(1)} s</span>
                          : r.done ? <span className="chip bad">{OUTCOME_LABELS[r.replay.summary.outcome]}</span>
                            : `${Math.max(0, 100 * r.frame.progress).toFixed(0)} %`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="card-title" style={{ marginTop: 16 }}>Participants</div>
              {racers.map((r) => (
                <label key={r.condition} style={{ display: "block", fontSize: 13, margin: "4px 0" }}>
                  <input type="checkbox" checked={!hidden.has(r.condition)} onChange={() => {
                    const next = new Set(hidden);
                    if (next.has(r.condition)) next.delete(r.condition); else next.add(r.condition);
                    setHidden(next);
                  }} />{" "}
                  <span className="swatch" style={{ background: conditionColor(r.condition) }} />{conditionLabel(r.condition)}
                  <span className="note"> — {r.replay.summary.outcome === "lap" ? `${r.replay.summary.lap_time.toFixed(1)} s` : OUTCOME_LABELS[r.replay.summary.outcome]}</span>
                </label>
              ))}
              <p className="note">Chaque voiture rejoue la meilleure course enregistrée de son algorithme sur ce circuit et cette
                adhérence (évaluation réelle, politique figée, sans exploration).</p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
