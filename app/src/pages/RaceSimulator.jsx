import { useMemo, useState } from "react";
import TrackCanvas, { speedColor } from "../components/TrackCanvas.jsx";
import CarSelector, { useCarReplays } from "../components/CarSelector.jsx";
import { ReplayFields } from "../components/ReplayPicker.jsx";
import { RacelineToggle, useRacelineOverlay } from "../components/RacelineOverlay.jsx";
import Telemetry from "../components/race/Telemetry.jsx";
import { DriverInputs, TrackStrip } from "../components/race/RaceUI.jsx";
import { clockLabel, gapLabel, raceProgress, speedStats } from "../components/race/raceData.js";
import { useActionMode, useRaceReference } from "../components/race/useRaceReference.js";
import { CONDITION_BY_ID, OUTCOME_LABELS, conditionColor, conditionLabel } from "../data/algorithms.js";
import { CAR_MODELS } from "../data/f1.js";
import { gapAtProgress, interpolateFrame } from "../data/interpolate.js";
import { PlaybackControls, usePlayback } from "../playback.jsx";

const SENSOR_NAMES = ["−90°", "−60°", "−30°", "0°", "+30°", "+60°", "+90°"];

function ReplayDashboard({ color, name, frame, progress, status, complete, impact, ghost, stats, lapTime }) {
  return <section className="card broadcast-dashboard" style={{ "--driver-color": color }} aria-label="Tableau de bord">
    <div className="dashboard-driver"><span />{name}</div>
    <div className="dashboard-speed">{Math.round(frame.v * 3.6)} <small>km/h</small></div>
    <div className="dashboard-line"><span>Chrono</span><strong>{clockLabel(frame.t)}</strong></div>
    <div className="dashboard-progress">
      <div className="dashboard-line"><span>Progression</span><strong>{Math.round(progress * 100)} %</strong></div>
      <progress aria-label="Progression du tour" max={1} value={progress} />
    </div>
    <div className={impact ? "dashboard-status incident" : complete ? "dashboard-status complete" : "dashboard-status"} role="status">
      <span />{status}
    </div>
    {ghost.source && <div className="dashboard-gap">
      <span>Écart au fantôme</span>
      <strong>{gapLabel(gapAtProgress(frame, ghost.timeline))}</strong>
    </div>}
    <dl className="dashboard-stats">
      <div><dt>Vitesse max.</dt><dd>{Math.round(stats.max)} <small>km/h</small></dd></div>
      <div><dt>Vitesse moy.</dt><dd>{Math.round(stats.mean)} <small>km/h</small></dd></div>
      <div><dt>Temps au tour</dt><dd>{lapTime == null ? "—" : clockLabel(lapTime)}</dd></div>
    </dl>
  </section>;
}

function Sensors({ frame, sensorRange, checked, onChange }) {
  return <details className="card race-sensors">
    <summary>Capteurs de distance</summary>
    <label className="note"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> Afficher les rayons</label>
    {frame.sensors_m.map((distance, index) => {
      const ratio = Math.min(1, distance / sensorRange);
      return <div key={index} className="gauge">
        <div className="dashboard-line"><span>{SENSOR_NAMES[index]}</span>
          <span>{distance >= sensorRange - 0.1 ? `≥ ${sensorRange}` : distance.toFixed(0)} m</span></div>
        <div className="bar"><div className="fill" style={{ left: 0, width: `${ratio * 100}%`, background: speedColor(1 - ratio, 1) }} /></div>
      </div>;
    })}
  </details>;
}

export default function RaceSimulator() {
  const { car, setCar, replays } = useCarReplays();
  const { entry, replay: loadedReplay, track, index, setIndex, playing, setPlaying, getTime, getFrame } = usePlayback();
  const [reference, setReference] = useState("");
  const [showSensors, setShowSensors] = useState(false);
  const replay = replays?.some((item) => item.path === entry?.path) ? loadedReplay : null;
  const { sensorRange, speedColorMax } = CAR_MODELS[car];
  const ideal = useRacelineOverlay(replay?.track_id, replay?.mu_factor, car);
  const ghost = useRaceReference(replays, replay, reference);
  const action = useActionMode(replay);
  const frame = replay?.frames[index];
  const visuals = useMemo(() => {
    if (!replay) return null;
    return {
      trail: { points: replay.frames.map((f) => [f.x, f.y]), speeds: replay.frames.map((f) => f.v) },
      impact: replay.frames.find((f) => f.off_track),
      stats: speedStats(replay.frames),
    };
  }, [replay]);
  const condition = entry?.condition;
  const color = conditionColor(condition);
  const impact = frame && frame.t >= visuals.impact?.t ? visuals.impact : null;
  const atEnd = replay && index === replay.frames.length - 1;
  const complete = atEnd && replay.summary.outcome === "lap";
  const status = impact ? "Sortie de piste" : atEnd ? OUTCOME_LABELS[replay.summary.outcome] : "Sur la piste";
  const activeReference = ghost.references.some((item) => item.condition === reference) ? reference : "";

  function getScene() {
    const pose = getFrame();
    const time = getTime();
    const cars = [{
      ...pose, id: "driver", color, label: CONDITION_BY_ID[condition]?.short ?? replay.agent.algo,
      impact: time >= visuals.impact?.t ? visuals.impact : null,
    }];
    if (ghost.source) {
      cars.unshift({
        ...interpolateFrame(ghost.source.frames, time), color: conditionColor(reference),
        label: CONDITION_BY_ID[reference].short, alpha: 0.52,
      });
    }
    return {
      cars,
      // La voiture observée reste celle du replay principal, même si le fantôme est dessiné avant elle.
      followId: "driver",
      rays: showSensors ? { x: pose.x, y: pose.y, psi: pose.psi, distances: pose.sensors_m } : null,
    };
  }

  return <div className="broadcast-page">
    <div className="page-header broadcast-page-header"><h2>Race Simulator</h2></div>
    <ReplayFields replays={replays} showOutcome={false}>
      <CarSelector car={car} loading={replays === null} setCar={(next) => { setPlaying(false); setCar(next); }} />
      {replay && <label className="field race-ghost-select">Voiture fantôme
        <select value={activeReference} onChange={(event) => setReference(event.target.value)}>
          <option value="">{ghost.references.length ? "Désactivée" : "Aucune référence disponible"}</option>
          {[...new Set(ghost.references.map((item) => item.condition))].map((id) => <option key={id} value={id}>{conditionLabel(id)}</option>)}
        </select>
      </label>}
    </ReplayFields>
    {ghost.loading && <p className="note race-load-notice" role="status">Chargement du fantôme…</p>}
    {ghost.error && <p className="warn race-load-notice" role="status">Fantôme indisponible.</p>}
    {replay && track && frame && <>
      <div className="broadcast-layout">
        <div className="card race-stage broadcast-stage">
          <TrackCanvas track={track} trails={[{ ...visuals.trail, count: index + 1, speedColorMax, width: 2.5, alpha: 0.72, maxSegments: 210 }]}
                       draw={ideal.draw} getScene={getScene} animating={playing} height={710} fullscreen broadcast
                       grip={replay.mu_factor} miniMap
                       header={<TrackStrip track={track} grip={replay.mu_factor}>
                         <span className="broadcast-header-time">{clockLabel(frame.t)}</span>
                       </TrackStrip>}
                       overlay={<>
                         {impact && <div className="broadcast-incident" aria-live="polite">Sortie de piste · {clockLabel(impact.t)}</div>}
                         <div className="fullscreen-replay-readout">
                           <strong>{Math.round(frame.v * 3.6)} <small>km/h</small></strong>
                           <span>{Math.round((complete ? 1 : raceProgress(frame)) * 100)} % · {status}</span>
                           {ghost.source && <span>Fantôme {gapLabel(gapAtProgress(frame, ghost.timeline))}</span>}
                         </div>
                       </>}>
            <PlaybackControls broadcast />
            <div className="controls broadcast-options"><RacelineToggle {...ideal} /></div>
          </TrackCanvas>
        </div>
        <div className="broadcast-sidebar">
          <ReplayDashboard color={color} name={conditionLabel(condition)} frame={frame}
                           progress={complete ? 1 : raceProgress(frame)} complete={complete} status={status}
                           impact={impact} ghost={ghost} stats={visuals.stats} lapTime={replay.summary.lap_time} />
          <DriverInputs action={frame.action} {...action} />
        </div>
      </div>
      <Telemetry replay={replay} ghost={ghost.source} length={track.length} index={index} mode={action.mode}
                 onSeek={(next) => { setPlaying(false); setIndex(next); }} />
      <Sensors frame={frame} sensorRange={sensorRange} checked={showSensors} onChange={setShowSensors} />
      <details className="explanation race-provenance">
        <summary>Source du replay</summary>
        <p>
          {replay.run_id}{replay.agent.checkpoint != null && ` · checkpoint ${replay.agent.checkpoint}`}
          {replay.seed != null && ` · graine ${replay.seed}`}
          {replay.agent.train_steps > 0 && ` · ${replay.agent.train_steps.toLocaleString("fr-FR")} pas d’entraînement`}
        </p>
      </details>
    </>}
  </div>;
}
