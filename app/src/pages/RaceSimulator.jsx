import { useMemo } from "react";
import TrackCanvas, { speedColor } from "../components/TrackCanvas.jsx";
import CarSelector, { useCarReplays } from "../components/CarSelector.jsx";
import { ReplayFields } from "../components/ReplayPicker.jsx";
import { RacelineToggle, useRacelineOverlay } from "../components/RacelineOverlay.jsx";
import { CONDITION_BY_ID, OUTCOME_LABELS, conditionColor, conditionLabel, muLabel } from "../data/algorithms.js";
import { CAR_MODELS, formatLapTimeGap, lapTimeGap } from "../data/f1.js";
import { PlaybackControls, usePlayback } from "../playback.jsx";

const SENSOR_NAMES = ["−90°", "−60°", "−30°", "0°", "+30°", "+60°", "+90°"];
const TIME = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Gauge({ label, value, min = 0, color, left: leftLabel, right: rightLabel }) {
  // Jauge horizontale : de 0 à 1, ou de -1 à 1 centrée (direction)
  const centered = min < 0;
  const left = centered ? 50 + Math.min(0, -value) * 50 : 0; // direction : gauche à gauche de l'écran
  const width = centered ? Math.abs(value) * 50 : value * 100;
  return (
    <div className="gauge">
      {label} <span style={{ float: "right" }}>{centered ? (value > 0.02 ? "gauche" : value < -0.02 ? "droite" : "tout droit") : `${Math.round(value * 100)} %`}</span>
      <div className="bar"><div className="fill" style={{ left: `${left}%`, width: `${width}%`, background: color }} /></div>
      {centered && <div className="note" style={{ display: "flex", justifyContent: "space-between" }}><span>{leftLabel}</span><span>{rightLabel}</span></div>}
    </div>
  );
}

// Profil de vitesse au cours de l'épisode, avec le curseur de lecture
function SpeedProfile({ frames, index, onSeek, car }) {
  const w = 900, h = 120, pad = 42;
  const { tMax, vMax, x, y, d, slips } = useMemo(() => {
    const tMax = frames.at(-1).t || 1;
    const vMax = frames.reduce((max, f) => Math.max(max, f.v * 3.6), car === "f1_2024" ? 350 : 72);
    const x = (t) => pad + ((w - pad - 8) * t) / tMax;
    const y = (v) => h - 18 - ((h - 30) * v * 3.6) / vMax;
    const d = frames.map((f, i) => `${i ? "L" : "M"}${x(f.t).toFixed(1)},${y(f.v).toFixed(1)}`).join("");
    return { tMax, vMax, x, y, d, slips: frames.filter((f) => f.slip) };
  }, [frames, car]);
  const cur = frames[index];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="speed-profile" role="img"
         aria-label="Vitesse au cours de l'épisode"
         onClick={(e) => {
           const r = e.currentTarget.getBoundingClientRect();
           const t = (((e.clientX - r.left) / r.width) * w - pad) / (w - pad - 8) * tMax;
           onSeek(Math.max(0, Math.min(frames.length - 1, Math.round(t / (frames[1]?.t - frames[0].t || 0.05)))));
         }}>
      {[0, 0.5, 1].map((k) => (
        <g key={k}>
          <line x1={pad} x2={w - 8} y1={y((vMax * k) / 3.6)} y2={y((vMax * k) / 3.6)} stroke="var(--line-2)" />
          <text x={pad - 4} y={y((vMax * k) / 3.6) + 4} fill="var(--muted)" textAnchor="end">{Math.round(vMax * k)}</text>
        </g>
      ))}
      {slips.map((f) => <line key={f.t} x1={x(f.t)} x2={x(f.t)} y1={h - 16} y2={h - 12} stroke="var(--warn)" />)}
      <path d={d} fill="none" stroke="var(--info)" className="chart-stroke" style={{ "--series-width": 2 }} />
      <line x1={x(cur.t)} x2={x(cur.t)} y1={8} y2={h - 18} stroke="var(--accent)" className="chart-stroke" style={{ "--series-width": 1.5 }} />
      <circle cx={x(cur.t)} cy={y(cur.v)} r="4" fill="var(--accent)" />
      <text x={w - 8} y={h - 2} fill="var(--muted)" textAnchor="end">temps (s) → · traits jaunes : dérapage</text>
      <text x={pad} y={13} fill="var(--muted)">km/h</text>
    </svg>
  );
}

export default function RaceSimulator() {
  const { car, setCar, replays } = useCarReplays();
  const { entry, replay: loadedReplay, track, index, setIndex, playing, setPlaying, getTime, getFrame } = usePlayback();
  const replay = replays?.some((r) => r.path === entry?.path) ? loadedReplay : null;
  const { sensorRange, speedColorMax } = CAR_MODELS[car];
  const ideal = useRacelineOverlay(replay?.track_id, replay?.mu_factor, car, true);
  const idealTime = ideal.line?.lap_time_s;
  const gap = replay?.summary.outcome === "lap" ? lapTimeGap(replay.summary.lap_time, idealTime) : null;
  const frame = replay?.frames[index];
  const visuals = useMemo(() => {
    if (!replay) return null;
    return {
      trail: { points: replay.frames.map((f) => [f.x, f.y]), speeds: replay.frames.map((f) => f.v) },
      impact: replay.frames.find((f) => f.off_track),
    };
  }, [replay]);
  const condition = entry?.condition;
  const color = conditionColor(condition);

  function getScene() {
    const pose = getFrame();
    const time = getTime();
    return {
      cars: [{
        ...pose, time, color, label: CONDITION_BY_ID[condition]?.short, frames: replay.frames,
        impact: time >= visuals.impact?.t ? visuals.impact : null,
      }],
      rays: { x: pose.x, y: pose.y, psi: pose.psi, distances: pose.sensors_m },
    };
  }

  return (
    <>
      <div className="page-header">
        <h2>Race Simulator</h2>
        <p>Choisissez un agent, un circuit et une adhérence pour rejouer une évaluation.</p>
        <details className="explanation">
          <summary>En savoir plus</summary>
          <p>La couleur de la trajectoire indique la vitesse, du bleu quand la voiture roule lentement au rouge quand elle accélère.</p>
        </details>
      </div>
      <ReplayFields replays={replays}>
        <CarSelector car={car} loading={replays === null} setCar={(next) => { setPlaying(false); setCar(next); }} />
      </ReplayFields>
      {replay && track && frame && (
        <div className="row">
          <div className="grow stack">
            <div className="card race-stage">
              <TrackCanvas track={track} trails={[{ ...visuals.trail, count: index + 1, speedColorMax, width: 2.5, alpha: 0.5 }]}
                           draw={ideal.draw} getScene={getScene} animating={playing} height={560} fullscreen>
                <PlaybackControls />
                <div className="controls"><RacelineToggle {...ideal} /></div>
              </TrackCanvas>
            </div>
            <div className="card">
              <div className="card-title">Vitesse au cours de l'épisode <span className="hint">clic = aller à cet instant</span></div>
              <SpeedProfile frames={replay.frames} index={index} car={car} onSeek={(i) => { setPlaying(false); setIndex(i); }} />
            </div>
          </div>
          <div className="stack race-readings">
            <div className="card">
              <div className="card-title"><span className="swatch" style={{ background: color }} />{conditionLabel(condition)}</div>
              {CONDITION_BY_ID[condition]?.help && <details className="explanation">
                <summary>En savoir plus sur le pilote</summary>
                <p>{CONDITION_BY_ID[condition].help}</p>
              </details>}
              <div className="stat"><div className="label">Vitesse</div><div className="value">{Math.round(frame.v * 3.6)} <small>km/h</small></div></div>
              <div className="stat"><div className="label">Chrono</div><div className="value">{frame.t.toFixed(1)} <small>s</small></div></div>
              <div className="gauge">Progression du tour <span style={{ float: "right" }}>{Math.max(0, 100 * frame.progress).toFixed(0)} % · checkpoint {frame.checkpoint}/20</span>
                <div className="bar"><div className="fill" style={{ left: 0, width: `${Math.max(0, Math.min(100, 100 * frame.progress))}%`, background: color }} /></div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
                {frame.slip && <span className="chip warn">Dérapage</span>}
                {frame.off_track && <span className="chip bad">Sortie de piste</span>}
                {!frame.slip && !frame.off_track && <span className="chip">Sur la piste</span>}
              </div>
            </div>
            <div className="card">
              <div className="card-title">Commandes de l'agent</div>
              <Gauge label="Volant" value={frame.action.steer} min={-1} color="var(--info)" left="gauche" right="droite" />
              <Gauge label="Accélérateur" value={frame.action.throttle} color="var(--good)" />
              <Gauge label="Frein" value={frame.action.brake} color="var(--accent)" />
            </div>
            <div className="card">
              <div className="card-title">Ce que voit la voiture <span className="hint">distance au bord (m)</span></div>
              {frame.sensors_m.map((d, k) => {
                const ratio = Math.min(1, d / sensorRange);
                return <div key={k} className="gauge" style={{ margin: "4px 0" }}>
                  capteur {SENSOR_NAMES[k]} <span style={{ float: "right" }}>{d >= sensorRange - 0.1 ? `≥ ${sensorRange}` : d.toFixed(0)} m</span>
                  <div className="bar"><div className="fill" style={{ left: 0, width: `${ratio * 100}%`, background: speedColor(1 - ratio, 1) }} /></div>
                </div>;
              })}
            </div>
            <div className="card">
              <div className="card-title">Résultat de l'épisode</div>
              <p style={{ margin: 0 }}>
                <span className={`chip ${replay.summary.outcome === "lap" ? "good" : "bad"}`}>{OUTCOME_LABELS[replay.summary.outcome]}</span>
                {replay.summary.lap_time != null && <> en <strong>{replay.summary.lap_time.toFixed(1)} s</strong></>}
              </p>
              {idealTime != null && <p className="note">Temps idéal théorique : <strong>{TIME.format(idealTime)} s</strong>
                {gap != null && <> · Écart : <strong>{formatLapTimeGap(gap)}</strong></>}
              </p>}
              <p className="note">{muLabel(replay.mu_factor)} · {track.name ?? replay.track_id} · checkpoint {replay.agent.checkpoint}
                {replay.agent.train_steps ? ` (${replay.agent.train_steps.toLocaleString("fr-FR")} pas d'entraînement)` : ""}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
