import { useMemo } from "react";
import TrackCanvas from "../components/TrackCanvas.jsx";
import ReplayPicker from "../components/ReplayPicker.jsx";
import { PlaybackControls, usePlayback } from "../playback.jsx";

function Gauge({ label, value, min = 0, color }) {
  // Jauge horizontale : de 0 à 1, ou de -1 à 1 centrée (direction)
  const centered = min < 0;
  const left = centered ? 50 + Math.min(0, value) * 50 : 0;
  const width = centered ? Math.abs(value) * 50 : value * 100;
  return (
    <div className="gauge">
      {label} <span style={{ float: "right" }}>{value.toFixed(2)}</span>
      <div className="bar"><div className="fill" style={{ left: `${left}%`, width: `${width}%`, background: color }} /></div>
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="stat"><div className="label">{label}</div><div className="value">{value}</div></div>;
}

export default function RaceSimulator() {
  const { replay, track, index } = usePlayback();
  const frame = replay?.frames[index];
  const trail = useMemo(() => (replay ? replay.frames.slice(0, index + 1).map((f) => [f.x, f.y]) : []), [replay, index]);

  return (
    <>
      <h2>Race Simulator</h2>
      <p className="subtitle">Rejoue un replay : circuit, voiture, rayons des capteurs, trajectoire et commandes.</p>
      <ReplayPicker />
      {replay && track && frame && (
        <div className="row">
          <div className="grow panel">
            <TrackCanvas track={track} trails={[{ points: trail, color: "#3987e5" }]}
                         cars={[{ x: frame.x, y: frame.y, psi: frame.psi, color: "#3987e5" }]}
                         rays={{ x: frame.x, y: frame.y, psi: frame.psi, distances: frame.sensors_m }} />
            <PlaybackControls />
          </div>
          <div className="panel" style={{ width: 280 }}>
            <Stat label="Vitesse" value={`${(frame.v * 3.6).toFixed(0)} km/h`} />
            <Stat label="Chrono" value={`${frame.t.toFixed(2)} s`} />
            <Stat label="Progression" value={`${(100 * frame.progress).toFixed(1)} %`} />
            <Stat label="Checkpoint" value={`${frame.checkpoint} / 20`} />
            <Gauge label="Direction" value={frame.action.steer} min={-1} color="#3987e5" />
            <Gauge label="Accélérateur" value={frame.action.throttle} color="#0ca30c" />
            <Gauge label="Frein" value={frame.action.brake} color="#e66767" />
            <p className="note">
              {frame.slip ? "Dérapage (limite d'adhérence dépassée) · " : ""}
              {frame.off_track ? "Sortie de piste · " : ""}
              récompense du pas {frame.reward.toFixed(3)}
            </p>
            <hr style={{ borderColor: "var(--line)" }} />
            <p className="note">
              {replay.agent.algo} · {replay.agent.checkpoint} · {replay.agent.train_steps.toLocaleString("fr-FR")} pas
              d'entraînement · μ × {replay.mu_factor}<br />
              Résultat : {replay.summary.outcome}
              {replay.summary.lap_time != null && ` en ${replay.summary.lap_time} s`}, récompense totale{" "}
              {replay.summary.total_reward}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
