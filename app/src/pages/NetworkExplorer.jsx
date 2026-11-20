import TrackCanvas from "../components/TrackCanvas.jsx";
import ReplayPicker from "../components/ReplayPicker.jsx";
import { PlaybackControls, usePlayback } from "../playback.jsx";

const OBS_NAMES = ["capteur −90°", "capteur −60°", "capteur −30°", "capteur 0°", "capteur +30°", "capteur +60°",
  "capteur +90°", "vitesse", "angle cap/piste", "écart latéral", "courbure à 30 m", "courbure à 80 m", "μ"];

// Couleur divergente : bleu (négatif) – gris neutre (0) – orange (positif)
function diverging(v) {
  const t = Math.max(-1, Math.min(1, v));
  const [r0, g0, b0] = [56, 56, 53];
  const [r1, g1, b1] = t >= 0 ? [235, 104, 52] : [57, 135, 229];
  const a = Math.abs(t);
  return `rgb(${Math.round(r0 + (r1 - r0) * a)},${Math.round(g0 + (g1 - g0) * a)},${Math.round(b0 + (b1 - b0) * a)})`;
}

function ValueBar({ label, value, min = -1 }) {
  const centered = min < 0;
  const v = Math.max(min, Math.min(1, value));
  const left = centered ? 50 + Math.min(0, v) * 50 : 0;
  const width = centered ? Math.abs(v) * 50 : v * 100;
  return (
    <div className="gauge" title={`${label} = ${value.toFixed(3)}`}>
      {label} <span style={{ float: "right" }}>{value.toFixed(2)}</span>
      <div className="bar"><div className="fill" style={{ left: `${left}%`, width: `${width}%`, background: diverging(v) }} /></div>
    </div>
  );
}

function Layer({ values, index }) {
  const cols = 8;
  return (
    <div>
      <div className="note">Couche cachée {index + 1} ({values.length} neurones)</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 18px)`, gap: 3, marginTop: 4 }}>
        {values.map((v, k) => (
          <div key={k} title={`neurone ${k} : ${v.toFixed(3)}`}
               style={{ width: 18, height: 18, borderRadius: 3, background: diverging(v) }} />
        ))}
      </div>
    </div>
  );
}

export default function NetworkExplorer() {
  const { replay, track, index } = usePlayback();
  const frame = replay?.frames[index];
  return (
    <>
      <h2>Neural Network Explorer</h2>
      <p className="subtitle">
        Entrées, activations des couches cachées et sorties du réseau, image par image, synchronisées avec le Race
        Simulator.
      </p>
      <p className="warn">Représentation pédagogique, pas une explication causale du comportement de l'agent.</p>
      <ReplayPicker />
      {replay && frame && (
        <>
          <PlaybackControls />
          <div className="row">
            <div className="panel" style={{ width: 260 }}>
              <strong>Entrées ({frame.obs.length})</strong>
              {frame.obs.map((v, k) => <ValueBar key={k} label={OBS_NAMES[k]} value={v} />)}
            </div>
            <div className="panel grow">
              <strong>Couches cachées</strong>
              {replay.network && (
                <p className="note">Réseau {replay.network.layers.join(" → ")}, activation {replay.network.activation}</p>
              )}
              {frame.activations ? (
                <div className="row" style={{ gap: 24 }}>
                  {frame.activations.map((layer, k) => <Layer key={k} values={layer} index={k} />)}
                </div>
              ) : (
                <p className="empty">
                  Ce replay ne contient pas d'activations (pilote classique, algorithme tabulaire ou évaluation lancée sans
                  <code> --with-activations</code>).
                </p>
              )}
              {track && (
                <div style={{ marginTop: 12 }}>
                  <TrackCanvas track={track} height={220}
                               cars={[{ x: frame.x, y: frame.y, psi: frame.psi, color: "#3987e5" }]} />
                </div>
              )}
            </div>
            <div className="panel" style={{ width: 220 }}>
              <strong>Sorties (commande)</strong>
              <ValueBar label="direction" value={frame.action.steer} />
              <ValueBar label="accélérateur" value={frame.action.throttle} min={0} />
              <ValueBar label="frein" value={frame.action.brake} min={0} />
              <p className="note">Bleu = négatif, gris = 0, orange = positif.</p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
