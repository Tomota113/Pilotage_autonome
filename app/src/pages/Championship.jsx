import { useEffect, useMemo, useRef, useState } from "react";
import CarSelector, { useCarReplays } from "../components/CarSelector.jsx";
import TrackCanvas from "../components/TrackCanvas.jsx";
import TrackOptions from "../components/TrackOptions.jsx";
import { RacelineToggle, useRacelineOverlay } from "../components/RacelineOverlay.jsx";
import { CONDITIONS, OUTCOME_LABELS, conditionColor, conditionLabel } from "../data/algorithms.js";
import { loadReplay, loadTrack } from "../data/api.js";
import { isF1Track } from "../data/f1.js";
import { interpolateFrame } from "../data/interpolate.js";
import { SPEEDS } from "../playback.jsx";

const ORDER = Object.fromEntries(CONDITIONS.map((c, i) => [c.id, i]));
const MUS = [1, 0.8, 0.6];
const LIGHT_COUNT = 5;
const LIGHT_STEP_MS = 500;
const STANDINGS_UPDATE_MS = 100;

// Pour un agent : sa meilleure course sur ce circuit et cette adhérence (tour bouclé le plus rapide, sinon la plus longue)
function bestOf(list) {
  return [...list].sort((a, b) => {
    const la = a.outcome === "lap" ? a.lap_time : Infinity;
    const lb = b.outcome === "lap" ? b.lap_time : Infinity;
    return la - lb;
  })[0];
}

function frameAt(replay, t) {
  return interpolateFrame(replay.frames, t);
}

export function adjacentRacer(standings, selectedId, step) {
  if (!standings.length) return null;
  const index = standings.findIndex((racer) => racer.condition === selectedId);
  if (index === -1) return standings[step > 0 ? 0 : standings.length - 1].condition;
  return standings[(index + step + standings.length) % standings.length].condition;
}

function lapProgress(racer) {
  return racer.finished ? 100 : Math.max(0, Math.min(100, Math.round(100 * racer.frame.progress)));
}

function Standings({ racers, selectedId, onSelect, title, compact = false }) {
  return (
    <div className={compact ? "fullscreen-standings" : undefined}>
      <div className="card-title">{title}</div>
      <div className="standings" role="table" aria-label={title}>
        <div className="standings-row headings" role="row">
          <span role="columnheader">#</span><span role="columnheader">Agent</span><span role="columnheader">État</span>
        </div>
        <div className="standings-body" role="rowgroup" style={{ "--rows": racers.length }}>
          {racers.map((racer, index) => {
            const selected = racer.condition === selectedId;
            const name = conditionLabel(racer.condition);
            return (
              <div key={racer.condition} className={`standings-row racer${selected ? " selected" : ""}`}
                   role="row" style={{ "--rank": index, "--racer-color": racer.color }}>
                <span role="cell">{index + 1}</span>
                <span role="cell">
                  <button type="button" className="standing-agent" aria-label={`Suivre ${name}`} aria-pressed={selected}
                          title={name} onClick={() => onSelect(racer.condition)}>
                    <span className="swatch" />{name}
                  </button>
                </span>
                <span role="cell">
                  {racer.finished ? <span className="chip good finish-chip">
                      <span role="img" aria-label="Tour terminé">🏁</span> {racer.replay.summary.lap_time.toFixed(1)} s
                    </span>
                    : racer.done ? <span className="chip bad">{OUTCOME_LABELS[racer.replay.summary.outcome]}</span>
                      : `${lapProgress(racer)} %`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StartLights({ signal }) {
  const go = signal === "go";
  const lit = go ? 0 : signal;
  return (
    <div className="start-lights">
      {Array.from({ length: LIGHT_COUNT }, (_, i) => (
        <span key={i} aria-hidden="true" className={i < lit ? "start-light lit" : "start-light"} />
      ))}
      <span className={go ? "start-go visible" : "start-go"} role="status">{go ? "GO" : "Départ dans quelques instants"}</span>
    </div>
  );
}

export default function Championship() {
  const { car, setCar, replays } = useCarReplays();
  const [wantedTrack, setWantedTrack] = useState(null);
  const [mu, setMu] = useState(1);
  const [race, setRace] = useState(null);
  const [hidden, setHidden] = useState(new Set());
  const [time, setTime] = useState(0);
  const [phase, setPhase] = useState("ready");
  const [signal, setSignal] = useState(null);
  const [speed, setSpeed] = useState(2);
  const [showTrails, setShowTrails] = useState(true);
  const [followedId, setFollowedId] = useState(null);
  const raceTime = useRef(0);
  const countdownStart = useRef(null);
  const playing = phase === "playing";
  const starting = phase === "countdown";
  const tracks = useMemo(() => {
    const count = {};
    for (const r of replays ?? []) if (r.condition) count[r.track_id] = (count[r.track_id] ?? new Set()).add(r.condition);
    return Object.entries(count).filter(([, s]) => s.size >= 2).map(([t]) => t).sort();
  }, [replays]);
  const trackId = [wantedTrack, "f1_monza", tracks.find(isF1Track), "gen_10", tracks[0]]
    .find((id) => tracks.includes(id));
  const ideal = useRacelineOverlay(trackId, mu, car);

  // Chargement du circuit et de la meilleure course de chaque agent
  useEffect(() => {
    setPhase("ready");
    setSignal(null);
    raceTime.current = 0;
    setTime(0);
    setRace(null);
    setFollowedId(null);
    if (!trackId) return;
    let cancelled = false;
    const byCondition = {};
    for (const r of replays) {
      if (r.track_id === trackId && Number(r.mu_factor) === mu && r.condition) (byCondition[r.condition] ??= []).push(r);
    }
    const entries = Object.entries(byCondition).map(([condition, list]) => ({ condition, entry: bestOf(list) }))
      .sort((a, b) => (ORDER[a.condition] ?? 99) - (ORDER[b.condition] ?? 99));
    Promise.all([
      loadTrack(trackId),
      Promise.all(entries.map(async ({ condition, entry }) => {
        const replay = await loadReplay(entry.path);
        return {
          condition, replay, color: conditionColor(condition), end: replay.frames.at(-1).t,
          impact: replay.frames.find((f) => f.off_track),
        };
      })),
    ]).then(([track, racers]) => {
      if (!cancelled) setRace({ trackId, mu, car, track, racers });
    }).catch(() => {
      if (!cancelled) setRace({ trackId, mu, car, error: true });
    });
    return () => { cancelled = true; };
  }, [trackId, mu, car, replays]);

  const current = race?.trackId === trackId && race?.mu === mu && race?.car === car ? race : null;
  const racers = current?.racers ?? [];
  const visible = racers.filter((r) => !hidden.has(r.condition));
  const duration = Math.max(0, ...visible.map((r) => r.end));

  function start() {
    raceTime.current = 0;
    countdownStart.current = null;
    setTime(0);
    setSignal(0);
    setPhase("countdown");
  }

  useEffect(() => {
    if (!starting) return undefined;
    let raf, lit = 0;
    const tick = (now) => {
      countdownStart.current ??= now;
      const step = Math.floor((now - countdownStart.current) / LIGHT_STEP_MS);
      if (step > LIGHT_COUNT) {
        setSignal("go");
        setPhase("playing");
        return;
      }
      if (step !== lit) {
        lit = step;
        setSignal(lit);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [starting]);

  useEffect(() => {
    if (signal !== "go") return undefined;
    const timeout = setTimeout(() => setSignal(null), 650);
    return () => clearTimeout(timeout);
  }, [signal]);

  useEffect(() => {
    if (!playing) return undefined;
    let raf, last = null, lastUpdate = null;
    const tick = (now) => {
      if (last !== null) raceTime.current = Math.min(duration, raceTime.current + ((now - last) / 1000) * speed);
      last = now;
      // Le Canvas lit l'horloge à chaque dessin, le classement à intervalles plus espacés.
      if (lastUpdate === null || now - lastUpdate >= STANDINGS_UPDATE_MS || raceTime.current >= duration) {
        setTime(raceTime.current);
        lastUpdate = now;
      }
      if (raceTime.current >= duration) setPhase("ready");
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration]);

  function togglePlayback() {
    if (playing) {
      setTime(raceTime.current);
      setPhase("paused");
    } else if (time > 0 && time < duration) {
      setPhase("playing");
    } else start();
  }

  function seek(next) {
    setPhase("paused");
    setSignal(null);
    raceTime.current = next;
    setTime(next);
  }

  // Classement en direct : tour fini d'abord (au temps), puis la plus grande progression à l'instant t
  const live = visible.map((r) => {
    const f = frameAt(r.replay, time);
    const done = time >= r.end;
    return { ...r, frame: f, done, finished: done && r.replay.summary.outcome === "lap" };
  }).sort((a, b) => {
    if (a.finished && b.finished) return a.replay.summary.lap_time - b.replay.summary.lap_time;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.frame.progress - a.frame.progress;
  });
  const followedRank = live.findIndex((racer) => racer.condition === followedId);
  const followed = live[followedRank];
  const selectedId = followed?.condition ?? null;

  useEffect(() => {
    if (!current?.track) return undefined;
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey
          || (event.key !== "ArrowUp" && event.key !== "ArrowDown") || !live.length
          || event.target.closest?.("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setFollowedId((id) => adjacentRacer(live, id, step));
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [current, live]);

  function getScene() {
    const t = raceTime.current;
    return {
      cars: live.map(({ condition, replay, color, impact }) => ({
        ...frameAt(replay, t), id: condition, color, time: t, frames: showTrails ? replay.frames : null,
        impact: t >= impact?.t ? impact : null,
      })),
    };
  }

  const standingsTitle = playing || (time > 0 && time < duration) ? "Classement en direct"
    : time >= duration && duration > 0 ? "Classement final" : "Classement";

  return (
    <>
      <div className="page-header">
        <h2>AI Championship</h2>
        <p>Les pilotes sur un même circuit, avec leur classement en direct.</p>
      </div>
      <div className="controls">
        <CarSelector car={car} setCar={setCar} loading={replays === null} />
        {tracks.length > 0 && <>
            <label className="field">Circuit
              <select value={trackId} onChange={(e) => setWantedTrack(e.target.value)}>
                <TrackOptions ids={tracks} />
              </select>
            </label>
            <div className="module-field">Adhérence
              <div className="segmented">
                {MUS.map((m) => (
                  <button key={m} className={m === mu ? "on" : ""} onClick={() => setMu(m)}>
                    {m === 1 ? "Normale" : m === 0.8 ? "Humide" : "Glissante"} (μ {m.toFixed(1).replace(".", ",")})
                  </button>
                ))}
              </div>
            </div>
        </>}
      </div>
      {replays === null ? <p className="note" role="status">Chargement des replays…</p>
        : tracks.length === 0 ? <p className="empty">Aucun circuit avec plusieurs agents pour cette voiture.</p>
        : (
          <div className="row">
            <div className="grow card race-stage">
              {current?.track ? (
                <TrackCanvas track={current.track} getScene={getScene} followedCarId={selectedId}
                             onFollowChange={setFollowedId} animating={playing} draw={ideal.draw} height={580}
                             fullscreen header={
                               <div className="controls camera-controls">
                                 <label>Caméra{" "}
                                   <select value={selectedId ?? ""} onChange={(e) => setFollowedId(e.target.value || null)}>
                                     <option value="">Vue d’ensemble</option>
                                     {visible.map((racer) => (
                                       <option key={racer.condition} value={racer.condition}>Suivre {conditionLabel(racer.condition)}</option>
                                     ))}
                                   </select>
                                 </label>
                                 {followed && (
                                   <div className="camera-telemetry" role="group" aria-label="Agent suivi">
                                     <strong><span className="swatch" style={{ background: followed.color }} />{conditionLabel(selectedId)}</strong>
                                     <span>{Math.round(followed.frame.v * 3.6)} km/h</span>
                                     <span>Position {followedRank + 1}/{live.length}</span>
                                     <span>Tour {lapProgress(followed)} %</span>
                                   </div>
                                 )}
                               </div>
                             } overlay={
                               <>
                                 {signal !== null && <StartLights signal={signal} />}
                                 {live.length > 0 && <Standings racers={live} selectedId={selectedId} onSelect={setFollowedId}
                                                               title={standingsTitle} compact />}
                               </>
                             }>
                  <div className="controls">
                    <button className="primary" onClick={togglePlayback} disabled={!visible.length || starting}>
                      {starting ? "Départ en cours" : playing ? "Pause" : time > 0 && time < duration ? "Reprendre" : "Départ"}
                    </button>
                    <button onClick={start} disabled={!visible.length}>Rejouer le départ</button>
                    <div className="segmented">
                      {SPEEDS.map((s) => <button key={s} className={s === speed ? "on" : ""} onClick={() => setSpeed(s)}>×{s}</button>)}
                    </div>
                    <input type="range" min={0} max={duration || 1} step={0.05} value={time} style={{ flex: 1, minWidth: 160 }}
                           disabled={!visible.length || starting} onChange={(e) => seek(Number(e.target.value))} aria-label="Curseur temporel" />
                    <span className="note">{time.toFixed(1)} s</span>
                    <label className="note"><input type="checkbox" checked={showTrails} onChange={(e) => setShowTrails(e.target.checked)} /> Traînées</label>
                    <RacelineToggle {...ideal} />
                  </div>
                </TrackCanvas>
              ) : current?.error ? <p className="warn" role="alert">Impossible de charger cette course.</p>
                : <p role="status">Chargement de la course…</p>}
            </div>
            <div className="card race-readings">
              <Standings racers={live} selectedId={selectedId} onSelect={setFollowedId} title={standingsTitle} />
              <details className="explanation participant-list">
                <summary>Participants et résultats</summary>
                {racers.map((r) => (
                  <label key={r.condition}>
                    <input type="checkbox" checked={!hidden.has(r.condition)} onChange={() => {
                      const next = new Set(hidden);
                      if (next.has(r.condition)) next.delete(r.condition); else next.add(r.condition);
                      if (r.condition === selectedId) setFollowedId(null);
                      setHidden(next);
                    }} />{" "}
                    <span className="swatch" style={{ background: r.color }} />{conditionLabel(r.condition)}
                    <span className="note"> — {r.replay.summary.outcome === "lap" ? `${r.replay.summary.lap_time.toFixed(1)} s` : OUTCOME_LABELS[r.replay.summary.outcome]}</span>
                  </label>
                ))}
              </details>
              <details className="explanation">
                <summary>En savoir plus</summary>
                <p>Chaque voiture rejoue la meilleure course enregistrée de son algorithme sur ce circuit et à cette adhérence.
                  Pendant l’évaluation, la politique est figée et l’agent n’explore plus.</p>
              </details>
            </div>
          </div>
      )}
    </>
  );
}
