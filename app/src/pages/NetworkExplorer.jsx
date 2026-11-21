import TrackCanvas from "../components/TrackCanvas.jsx";
import ReplayPicker from "../components/ReplayPicker.jsx";
import { formatNumber } from "../components/charts/LineChart.jsx";
import { conditionColor } from "../data/algorithms.js";
import { SENSOR_ANGLES_DEG } from "../data/geometry.js";
import { PlaybackControls, usePlayback } from "../playback.jsx";

const INPUTS = [
  ...SENSOR_ANGLES_DEG.map((angle) => `Distance au bord à ${angle < 0 ? "−" : angle > 0 ? "+" : ""}${Math.abs(angle)}°`),
  "Vitesse", "Angle voiture–piste", "Écart au centre de la piste",
  "Courbure à 30 m", "Courbure à 80 m", "Adhérence",
];
const OUTPUTS = { steer: "Direction", throttle: "Accélérateur", brake: "Frein" };
const CURVE_THRESHOLD = 0.1;
const SHORT_NUMBER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

// La couleur évolue du gris vers le bleu ou l’orange à mesure que la valeur s’éloigne de zéro.
function diverging(value) {
  const strength = Math.min(1, Math.abs(value));
  const neutral = [112, 119, 131];
  const color = value < 0 ? [57, 135, 255] : [255, 140, 47];
  return `rgb(${neutral.map((base, i) => Math.round(base + (color[i] - base) * strength)).join(",")})`;
}

export function describeFrame({ obs, action }) {
  const curveAt30 = obs[10];
  const curveAt80 = obs[11];
  const distance = Math.abs(curveAt80) > CURVE_THRESHOLD ? 80 : Math.abs(curveAt30) > CURVE_THRESHOLD ? 30 : null;
  const curve = distance === 80 ? curveAt80 : curveAt30;
  const road = distance ? `La voiture détecte un virage à ${curve > 0 ? "gauche" : "droite"} à ${distance} m`
    : "La voiture ne détecte pas de virage marqué à 30 ni à 80 m";
  const steering = Math.abs(action.steer) > 0.15 ? ` et braque à ${action.steer > 0 ? "gauche" : "droite"}` : "";
  const command = action.brake > 0.5 ? "freine"
    : action.throttle > 0.5 ? "accélère"
    : action.brake > 0.05 ? "freine légèrement"
    : action.throttle > 0.05 ? "accélère légèrement" : "roule sans accélérer ni freiner franchement";
  return `${road}. À cet instant, elle ${command}${steering}.`;
}

function Signal({ x, y, label, value, labelX, valueX }) {
  return <g>
    <title>{`${label} · ${formatNumber(value)}`}</title>
    <rect x={Math.min(labelX, x - 12)} y={y - 10} width={valueX - Math.min(labelX, x - 12)} height="20" fill="transparent" />
    <circle cx={x} cy={y} r="5.5" fill={diverging(value)} />
    <text x={labelX} y={y} dy=".35em">{label}</text>
    <text x={valueX} y={y} dy=".35em" textAnchor="end" fill="var(--muted)">
      {SHORT_NUMBER.format(value)}
    </text>
  </g>;
}

const LAYERS = [280, 432];
const INPUT_X = 221;
const OUTPUT_X = 570;
const inputY = (i) => 53 + i * 22;
const outputY = (i) => 105 + i * 62;
const neuronY = (i) => 89 + i * 21;

function Diagram({ frame, discrete }) {
  return <div style={{ overflowX: "auto" }} role="region" aria-label="Schéma du réseau" tabIndex={0}>
    <svg viewBox="0 0 704 314" role="img" aria-label="Entrées, deux couches de neurones et commandes appliquées"
         style={{ display: "block", width: "100%", minWidth: 560 }} fill="var(--text)" fontSize="12">
      <g fontSize="14" fontWeight="650">
        <text x="8" y="23">Entrées ({formatNumber(frame.obs.length)})</text>
        {frame.activations.map((values, layer) => (
          <text x={LAYERS[layer] + 55} y="23" key={layer} textAnchor="middle">
            Couche {layer + 1} · {formatNumber(values.length)}
          </text>
        ))}
        <text x={OUTPUT_X + 12} y="23">{discrete ? "Commandes" : "Sorties (3)"}</text>
      </g>
      <g aria-hidden="true" stroke="var(--faint)" strokeOpacity=".35">
        {[1, 4, 8, 10].map((i, index) => (
          <line key={i} x1={INPUT_X} y1={inputY(i)} x2={LAYERS[0]} y2={neuronY(index * 2)} />
        ))}
        {[0, 2, 4, 7].map((row) => (
          <line key={row} x1={LAYERS[0] + 112} y1={neuronY(row)} x2={LAYERS[1]} y2={neuronY((row + 1) % 8)} />
        ))}
        {[1, 4, 6].map((row, i) => (
          <line key={row} x1={LAYERS[1] + 112} y1={neuronY(row)} x2={OUTPUT_X} y2={outputY(i)} />
        ))}
      </g>
      {frame.obs.map((value, index) => <Signal key={index} x={INPUT_X} y={inputY(index)}
        label={INPUTS[index]} value={value} labelX={8} valueX={205} />)}
      {frame.activations.map((values, layer) => (
        <g key={layer}>
          {values.map((value, index) => (
            <circle key={index} cx={LAYERS[layer] + index % 8 * 16} cy={neuronY(Math.floor(index / 8))}
                    r="5.6" fill={diverging(value)} stroke="transparent" strokeWidth="4">
              <title>{`Couche ${layer + 1} · neurone ${index + 1} · ${formatNumber(value)}`}</title>
            </circle>
          ))}
        </g>
      ))}
      {Object.entries(OUTPUTS).map(([key, label], index) => <Signal key={key} x={OUTPUT_X} y={outputY(index)}
        label={label} value={frame.action[key]} labelX={OUTPUT_X + 12} valueX={696} />)}
    </svg>
  </div>;
}

export default function NetworkExplorer() {
  const { entry, replay, track, index, error } = usePlayback();
  const current = entry?.has_activations && replay && replay.run_id === entry.run_id && replay.track_id === entry.track_id
    && replay.mu_factor === entry.mu_factor && (!entry.checkpoint || replay.agent?.checkpoint === entry.checkpoint);
  const frame = current ? replay.frames[index] : null;
  const discrete = replay?.agent?.algo === "dqn";

  return <div className="stack">
    <header className="page-header" style={{ marginBottom: 0 }}>
      <h2>Comprendre le réseau de neurones</h2>
      <p>Avancez image par image pour relier ce que voit la voiture aux commandes qu’elle applique.</p>
    </header>
    <p className="help" style={{ margin: 0 }}>
      Le réseau reçoit 12 nombres qui décrivent ce que voit la voiture et sa position sur la piste.
      Deux groupes de 64 neurones, appelés couches, transforment ces nombres.
      Le résultat se traduit en trois commandes pour la voiture, la direction, l’accélérateur et le frein.
    </p>
    <ReplayPicker onlyWithActivations />
    {entry?.has_activations && !frame && !error && <p role="status">Chargement du replay…</p>}
    {frame && !frame.activations?.length && <p className="empty">Les valeurs des neurones sont absentes de cette image.</p>}
    {frame && (
      <>
        <div className="row">
          {frame.activations?.length > 0 && <section className="card" style={{ flex: "2 1 550px", minWidth: 0 }}>
            <h3 className="card-title">De la piste aux commandes</h3>
            <Diagram frame={frame} discrete={discrete} />
            <p className="note" style={{ marginBottom: 0 }}>
              <strong>Comment lire ce schéma.</strong> Suivez les colonnes de gauche à droite.
              Survolez un point pour lire sa valeur. Les entrées sont ramenées à une échelle commune.
            </p>
            <div className="controls note" aria-label="Couleur des valeurs">
              {[[-1, "Négatif"], [0, "Zéro"], [1, "Positif"]].map(([value, label]) => <span key={value}>
                <span className="swatch" style={{ background: diverging(value) }} />{label}
              </span>)}
            </div>
            {discrete && <p className="note">DQN choisit parmi neuf actions possibles. Le schéma montre les trois commandes correspondant à l’action choisie.</p>}
          </section>}
          <section className="card" style={{ flex: "1 1 300px", minWidth: 0 }}>
            <h3 className="card-title">La voiture sur le circuit</h3>
            <TrackCanvas track={track} height={300} cars={[{ ...frame, color: conditionColor(entry.condition) }]}
                         rays={{ x: frame.x, y: frame.y, psi: frame.psi, distances: frame.sensors_m }} />
            <PlaybackControls />
            <p className="note" style={{ marginBottom: 0 }}>Les rayons jaunes mesurent la distance jusqu’au bord de la piste.</p>
          </section>
        </div>
        <section className="card">
          <h3 className="card-title">Que se passe-t-il à cet instant ?</h3>
          <p>{describeFrame(frame)}</p>
          <p className="note" style={{ marginBottom: 0 }}>Représentation pédagogique, pas une explication causale.</p>
        </section>
      </>
    )}
  </div>;
}
