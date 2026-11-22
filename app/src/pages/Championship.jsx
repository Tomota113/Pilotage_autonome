import { useEffect, useMemo, useRef, useState } from "react";
import CarSelector, { useCarReplays } from "../components/CarSelector.jsx";
import TrackCanvas from "../components/TrackCanvas.jsx";
import TrackOptions from "../components/TrackOptions.jsx";
import { RacelineToggle, useRacelineOverlay } from "../components/RacelineOverlay.jsx";
import { CONDITIONS, CONDITION_BY_ID, OUTCOME_LABELS, conditionColor, conditionLabel } from "../data/algorithms.js";
import { loadReplay, loadTrack } from "../data/api.js";
import { isF1Track } from "../data/f1.js";
import { interpolateFrame, progressTimeline } from "../data/interpolate.js";
import { TrackStrip } from "../components/race/RaceUI.jsx";
import { RaceFinish, TimingTower } from "../components/race/TimingTower.jsx";
import { clockLabel, GRID_RELEASE_SECONDS, gridSlot, raceProgress, rankRacers } from "../components/race/raceData.js";
import { SPEEDS } from "../playback.jsx";

const ORDER = Object.fromEntries(CONDITIONS.map((c, i) => [c.id, i]));
const MUS = [1, 0.8, 0.6];
const LIGHT_COUNT = 5;
const LIGHT_STEP_MS = 500;
const STANDINGS_UPDATE_MS = 100;
const EMPTY = [];
const LEADER = "leader";

// Le tour valide le plus rapide du catalogue ; à défaut, le premier replay disponible.
function bestOf(list) {
  return [...list].sort((a, b) => {
    const la = a.outcome === "lap" ? a.lap_time : Infinity;
    const lb = b.outcome === "lap" ? b.lap_time : Infinity;
    return la - lb;
  })[0];
}

export function adjacentRacer(standings, selectedId, step) {
  if (!standings.length) return null;
  const index = standings.findIndex((racer) => racer.condition === selectedId);
  if (index === -1) return standings[step > 0 ? 0 : standings.length - 1].condition;
  return standings[(index + step + standings.length) % standings.length].condition;
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
  const [speed, setSpeed] = useState(1);
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
          timeline: progressTimeline(replay.frames),
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
  const racers = current?.racers ?? EMPTY;
  const visible = useMemo(() => racers.filter((r) => !hidden.has(r.condition))
    .map((racer, index) => ({ ...racer, slot: gridSlot(index) })), [racers, hidden]);
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

  const live = useMemo(() => rankRacers(visible, time), [visible, time]);
  const bestLap = Math.min(...live.filter((racer) => racer.finished).map((racer) => racer.replay.summary.lap_time));
  const selectedId = followedId === LEADER ? live[0]?.condition : followedId;
  const followed = live.find((racer) => racer.condition === selectedId);
  const finished = duration > 0 && time >= duration;
  const standingsTitle = finished ? "Classement final" : time > 0 || playing ? "Classement en direct" : "Grille de départ";

  useEffect(() => {
    if (!current?.track) return undefined;
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey
          || (event.key !== "ArrowUp" && event.key !== "ArrowDown") || !live.length
          || event.target.closest?.("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setFollowedId((id) => adjacentRacer(live, id === LEADER ? live[0].condition : id, step));
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [current, live]);

  function getScene() {
    const t = raceTime.current;
    const gridActive = t < GRID_RELEASE_SECONDS;
    return {
      gridActive,
      cars: visible.map(({ condition, replay, color, impact, slot }) => ({
        ...interpolateFrame(replay.frames, t), id: condition, color, time: t, frames: showTrails ? replay.frames : null,
        grid: slot, label: CONDITION_BY_ID[condition]?.short ?? condition,
        impact: t >= impact?.t ? impact : null,
      })),
    };
  }

  return (
    <div className="broadcast-page">
      <div className="page-header broadcast-page-header"><h2>AI Championship</h2></div>
      <div className="controls broadcast-setup">
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
          <>
            <div className="broadcast-layout championship-layout">
              <div className="card race-stage broadcast-stage">
                {current?.track ? (
                  <TrackCanvas track={current.track} getScene={getScene} followedCarId={followed?.condition ?? null}
                               onFollowChange={setFollowedId} animating={playing} draw={ideal.draw} height={710}
                               fullscreen broadcast grip={mu} gridCount={visible.length} header={
                                 <TrackStrip track={current.track} grip={mu}>
                                   <span className="broadcast-header-time">{clockLabel(time)}</span>
                                 </TrackStrip>
                               } overlay={
                                 <>
                                   {signal !== null && <StartLights signal={signal} />}
                                   {live.length > 0 && <TimingTower racers={live} selectedId={selectedId} onSelect={setFollowedId}
                                                                    title={standingsTitle} bestLap={bestLap} compact />}
                                 </>
                               }>
                    <div className="controls broadcast-playback">
                      <button className="primary" onClick={togglePlayback} disabled={!visible.length || starting}>
                        {starting ? "Départ en cours" : playing ? "Pause" : time > 0 && time < duration ? "Reprendre" : "Départ"}
                      </button>
                      <button onClick={start} disabled={!visible.length}>Rejouer le départ</button>
                      <div className="segmented" role="group" aria-label="Vitesse de lecture">
                        {SPEEDS.map((s) => <button key={s} className={s === speed ? "on" : ""} aria-pressed={s === speed}
                                                   onClick={() => setSpeed(s)}>{s === 0.5 ? "Ralenti ×0,5" : `×${s}`}</button>)}
                      </div>
                      <input type="range" min={0} max={duration || 1} step={0.05} value={Math.min(time, duration)}
                             disabled={!visible.length || starting} onChange={(e) => seek(Number(e.target.value))} aria-label="Curseur temporel" />
                    </div>
                    <div className="controls broadcast-options">
                      <label className="race-camera">Caméra{" "}
                        <select value={followedId ?? ""} onChange={(e) => setFollowedId(e.target.value || null)}>
                          <option value="">Vue d’ensemble</option>
                          <option value={LEADER} disabled={!visible.length}>Suivre le leader</option>
                          {visible.map((racer) => (
                            <option key={racer.condition} value={racer.condition}>Suivre {conditionLabel(racer.condition)}</option>
                          ))}
                        </select>
                      </label>
                      <label><input type="checkbox" checked={showTrails} onChange={(e) => setShowTrails(e.target.checked)} /> Traînées</label>
                      <RacelineToggle {...ideal} />
                      {followed && <div className="camera-telemetry" role="group" aria-label="Agent suivi">
                        <strong><span className="swatch" style={{ background: followed.color }} />{CONDITION_BY_ID[selectedId]?.short ?? selectedId}</strong>
                        <span>{Math.round(followed.frame.v * 3.6)} km/h</span>
                        <span>P{followed.position}/{live.length}</span>
                        <span>Tour {followed.finished ? 100 : Math.round(raceProgress(followed.frame) * 100)} %</span>
                      </div>}
                    </div>
                    {finished && <div className="fullscreen-race-finish"><RaceFinish racers={live} /></div>}
                  </TrackCanvas>
                ) : current?.error ? <p className="warn" role="alert">Impossible de charger cette course.</p>
                  : <p role="status">Chargement de la course…</p>}
              </div>
              {current?.track && <TimingTower racers={live} selectedId={selectedId} onSelect={setFollowedId}
                                             title={standingsTitle} bestLap={bestLap} />}
            </div>
            {finished && <RaceFinish racers={live} />}
            {racers.length > 0 && <details className="card explanation participant-list">
              <summary>Participants et résultats</summary>
              <p>Chaque pilote rejoue un épisode enregistré sur ce circuit et à cette adhérence. Le meilleur tour valide est retenu s’il existe.</p>
              {racers.map((racer) => (
                <label key={racer.condition}>
                  <input type="checkbox" checked={!hidden.has(racer.condition)} onChange={() => {
                    const next = new Set(hidden);
                    if (next.has(racer.condition)) next.delete(racer.condition); else next.add(racer.condition);
                    if (racer.condition === followedId) setFollowedId(null);
                    setHidden(next);
                  }} />{" "}
                  <span className="swatch" style={{ background: racer.color }} />{conditionLabel(racer.condition)}
                  <span className="note"> — {racer.replay.summary.outcome === "lap" ? clockLabel(racer.replay.summary.lap_time) : OUTCOME_LABELS[racer.replay.summary.outcome]}</span>
                </label>
              ))}
            </details>}
          </>
      )}
    </div>
  );
}
