import { muLabel } from "../../data/algorithms.js";
import { SECTOR_COLORS } from "./trackArtwork.js";

export function TrackStrip({ track, grip, children }) {
  return <div className="broadcast-strip">
    <span className="broadcast-venue"><strong>{track.name ?? track.id}</strong><small>{muLabel(grip)}</small></span>
    <span className="broadcast-sectors" aria-label="Légende des trois secteurs">
      {SECTOR_COLORS.map((color, index) => <span key={color} style={{ "--sector": color }}>S{index + 1}</span>)}
    </span>
    {children}
  </div>;
}

export const pedalValue = (action) => action.throttle - action.brake;

function ActionMeter({ label, value, ends, color }) {
  const centered = Boolean(ends);
  const width = Math.abs(value) * (centered ? 50 : 100);
  const start = centered ? 50 + Math.min(0, value) * 50 : 0;
  const percent = Math.round(Math.abs(value) * 100);
  const direction = !percent || !centered ? "" : value < 0 ? ends[0].slice(2) : ends[2].slice(0, -2);
  const formatted = `${percent} %${direction ? ` ${direction.toLowerCase()}` : ""}`;
  return <div className="action-meter">
    <div className="action-name"><span>{label}</span><strong>{formatted}</strong></div>
    <div className={centered ? "action-bar centered" : "action-bar"} aria-hidden="true">
      <span style={{ left: `${start}%`, width: `${width}%`, background: color }} />
    </div>
    {ends && <div className="action-ends">{ends.map((end) => <span key={end}>{end}</span>)}</div>}
  </div>;
}

export function DriverInputs({ action, mode, loading, unavailable }) {
  const steer = -action.steer;
  const pedal = pedalValue(action);
  return <section className="card race-inputs" aria-label="Commandes de l’agent">
    <div className="broadcast-label">Commandes de l’agent</div>
    <div className="wheel-input">
      <div className="steering-wheel" aria-hidden="true" style={{ transform: `rotate(${steer * 115}deg)` }}>
        <i /><i /><i />
      </div>
      <ActionMeter label="Volant" value={steer} ends={["← Gauche", "0", "Droite →"]} color="var(--info)" />
    </div>
    {mode === "pedal" ? <ActionMeter label="Pédale" value={pedal} ends={["← Frein", "0", "Gaz →"]}
                                    color={pedal < 0 ? "var(--bad)" : "var(--good)"} />
      : <>
          <ActionMeter label="Accélérateur" value={action.throttle} color="var(--good)" />
          <ActionMeter label="Frein" value={action.brake} color="var(--bad)" />
        </>}
    {mode === "discrete9" && <small className="note">Commandes discrètes</small>}
    {loading && <small className="note">Chargement de l’espace d’action…</small>}
    {unavailable && <small className="note">Commandes décodées · espace d’action indisponible</small>}
  </section>;
}
