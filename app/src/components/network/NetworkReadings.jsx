import { denormalizeObservation, getObservationLabels, getTrackHalfWidth, topActivations } from "../../data/network.js";
import { formatNumber } from "../charts/LineChart.jsx";

const MEASURE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const CURVATURE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 5 });

export function SignedBar({ value, max = 1 }) {
  const size = Math.abs(value) / max * 50;
  return <span className="network-bar" aria-hidden="true">
    <span className={value < 0 ? "negative" : "positive"}
          style={{ width: `${size}%`, left: `${value < 0 ? 50 - size : 50}%` }} />
  </span>;
}

export function formatMeasure({ value, unit }) {
  const formatter = unit === "m⁻¹" ? CURVATURE : MEASURE;
  return value === null ? "—" : `${formatter.format(value)}${unit ? ` ${unit}` : ""}`;
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
        return <li key={labels[index]}>
          <span>{labels[index]}</span>
          <SignedBar value={value} />
          <span className="network-number"><span className="network-sr-only">Valeur normalisée </span>{formatNumber(value)}</span>
          <span className="network-number">
            <span className="network-sr-only">Mesure </span>
            {formatMeasure(measure)}
          </span>
        </li>;
      })}
    </ul>
  </section>;
}

export function ActivationBars({ frame, layerSizes }) {
  const { activations } = frame;
  return <section className="card">
    <h3 className="card-title">Neurones les plus actifs</h3>
    <p className="note">Les dix valeurs les plus éloignées de zéro dans chaque couche.</p>
    <div className="network-layers">
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
    </div>
  </section>;
}
