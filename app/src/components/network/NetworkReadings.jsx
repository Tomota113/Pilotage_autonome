import { denormalizeObservation, getObservationLabels, getTrackHalfWidth, pedalValue, topActivations } from "../../data/network.js";
import { formatNumber } from "../charts/LineChart.jsx";

const MEASURE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const CURVATURE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 5 });

function SignedBar({ value, max = 1 }) {
  const size = Math.abs(value) / max * 50;
  return <span className="network-bar" aria-hidden="true">
    <span className={value < 0 ? "negative" : "positive"}
          style={{ width: `${size}%`, left: `${value < 0 ? 50 - size : 50}%` }} />
  </span>;
}

export function ObservationBars({ frame, previousFrame, car, track, isNetwork }) {
  // Les observations précèdent la commande, contrairement à la position de cette image.
  const width = getTrackHalfWidth(track, previousFrame ?? frame);
  const labels = getObservationLabels(car, frame.obs.length);
  const measures = denormalizeObservation(frame.obs, car, width);
  return <section className="card">
    <h3 className="card-title">{isNetwork ? "Entrées du réseau à cet instant" : "Mesures de l’environnement à cet instant"}</h3>
    <p className="note">
      Les barres partent de zéro au milieu et montrent les valeurs sur l’échelle de −1 à +1.
      Les mesures avant la commande sont reconstruites à partir des valeurs arrondies du replay.
      Un capteur à sa portée maximale ne voit aucun bord plus proche.
    </p>
    <div className="network-reading-key" aria-hidden="true">
      <span>Entrée</span><span>Normalisée</span><span>Mesure</span>
    </div>
    <ul className="network-readings">
      {frame.obs.map((value, index) => {
        const measure = measures[index];
        const formatter = measure.unit === "m⁻¹" ? CURVATURE : MEASURE;
        return <li key={labels[index]}>
          <span>{labels[index]}</span>
          <SignedBar value={value} />
          <span className="network-number"><span className="network-sr-only">Valeur normalisée </span>{formatNumber(value)}</span>
          <span className="network-number">
            <span className="network-sr-only">Mesure </span>
            {measure.value === null ? "—" : `${formatter.format(measure.value)}${measure.unit ? ` ${measure.unit}` : ""}`}
          </span>
        </li>;
      })}
    </ul>
  </section>;
}

// La vue complète permet de retrouver un neurone même lorsqu’il quitte les dix premiers.
function ActivationOverview({ frame, car, mode }) {
  const { obs, action, activations } = frame;
  const commands = mode === "pedal"
    ? [["Volant", action.steer], ["Pédale", pedalValue(action)]]
    : [["Volant", action.steer], ["Accélérateur", action.throttle], ["Frein", action.brake]];
  const labels = getObservationLabels(car, obs.length);
  const groups = [
    { name: "Entrées", signals: obs.map((value, index) => [labels[index], value]) },
    ...activations.map((values, layer) => ({
      name: `Couche ${layer + 1}`,
      signals: values.map((value, index) => [`Couche ${layer + 1} · neurone ${index + 1}`, value]),
    })),
    { name: "Commandes appliquées", signals: commands },
  ];
  const rowCount = Math.max(...groups.map(({ signals }) => Math.ceil(signals.length / 16)));

  return <details className="network-overview">
    <summary>Voir toutes les activations de cette image</summary>
    <p className="note">Survole un point pour lire sa valeur. Les valeurs négatives sont en bleu et les positives en jaune.</p>
    <svg viewBox={`0 0 ${groups.length * 150} ${30 + rowCount * 10}`} role="img"
         aria-label="Vue complète des valeurs enregistrées dans cette image">
      {groups.map(({ name, signals }, group) => <g key={name} transform={`translate(${group * 150 + 5}, 0)`}>
        <text y={13}>{name}</text>
        {signals.map(([label, value], index) => (
          <circle key={label} cx={4 + index % 16 * 9} cy={25 + Math.floor(index / 16) * 10} r={3.5}
                  fill={`var(--${value < 0 ? "info" : value > 0 ? "warn" : "faint"})`}>
            <title>{`${label} · ${formatNumber(value)}`}</title>
          </circle>
        ))}
      </g>)}
    </svg>
  </details>;
}

export function ActivationBars({ frame, car, mode, layerSizes, hasActivations }) {
  const { activations } = frame;
  return <section className="card">
    <h3 className="card-title">Neurones les plus actifs</h3>
    {!hasActivations ? <p className="note">Les activations n’ont pas été enregistrées dans ce replay. Les entrées et les commandes restent visibles.</p>
      : <p className="note">Dans chaque couche, les dix valeurs les plus éloignées de zéro sont affichées, même lorsqu’elles sont négatives.</p>}
    {hasActivations && <div className="network-layers">
      {layerSizes?.map((size, index) => {
        const values = topActivations(activations?.[index] ?? []);
        const max = Math.max(1, Math.abs(values[0]?.value ?? 0));
        return <div key={index}>
          <h4>Couche {index + 1} · {size} neurones</h4>
          {values.length ? <ol className="network-readings network-neurons">
            {values.map(({ neuron, value }) => <li key={neuron}>
              <span>Neurone {neuron}</span>
              <SignedBar value={value} max={max} />
              <span className="network-number">{formatNumber(value)}</span>
            </li>)}
          </ol> : <p className="note">Activations absentes à cet instant.</p>}
        </div>;
      })}
    </div>}
    {activations?.some((values) => values.length > 0) && <ActivationOverview frame={frame} car={car} mode={mode} />}
  </section>;
}
