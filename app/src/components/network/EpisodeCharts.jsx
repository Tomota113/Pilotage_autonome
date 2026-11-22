import { useMemo } from "react";
import { pedalValue } from "../../data/network.js";
import { formatNumber } from "../charts/LineChart.jsx";

const NUMBER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const PERCENT = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });

const SPEED = { label: "Vitesse", unit: "km/h", color: "var(--info)", read: (frame) => frame.v * 3.6 };
const STEER = {
  label: "Volant", min: -1, color: "var(--warn)", read: (frame) => frame.action.steer,
  help: "Négatif vers la droite, positif vers la gauche.",
};
const PEDAL = {
  label: "Pédale", min: -1, color: "var(--good)", read: (frame) => pedalValue(frame.action),
  help: "Négatif pour freiner, zéro en roue libre, positif pour accélérer.",
};
const THROTTLE = { label: "Accélérateur", color: "var(--good)", read: (frame) => frame.action.throttle };
const BRAKE = { label: "Frein", color: "var(--bad)", read: (frame) => frame.action.brake };

const LEFT = 46;
const RIGHT = 310;
const TOP = 12;
const BOTTOM = 96;

function formatValue(value, unit) {
  return unit ? `${NUMBER.format(value)} ${unit}` : PERCENT.format(value);
}

function EpisodeChart({ frames, index, metric, rank }) {
  const { label, unit, color, read, min: lowerBound = 0, activation = false } = metric;
  const format = activation ? formatNumber : (value) => formatValue(value, unit);
  const { x, y, path, ticks, duration } = useMemo(() => {
    const duration = frames.at(-1).t || 1;
    const amplitude = activation
      ? frames.reduce((peak, frame) => Math.max(peak, Math.abs(read(frame) ?? 0)), 0)
      : 0;
    const min = activation ? -(amplitude || 1) : lowerBound;
    const max = activation ? -min : unit
      ? Math.ceil(frames.reduce((peak, frame) => Math.max(peak, read(frame)), 50) / 50) * 50
      : 1;
    const x = (time) => LEFT + (time / duration) * (RIGHT - LEFT);
    const y = (value) => BOTTOM - ((value - min) / (max - min)) * (BOTTOM - TOP);
    let connected = false;
    const path = frames.map((frame) => {
      const value = read(frame);
      if (!Number.isFinite(value)) {
        connected = false;
        return "";
      }
      const px = x(frame.t).toFixed(2);
      const py = y(value).toFixed(2);
      // Une commande reste fixe entre deux décisions. Une valeur absente coupe la courbe.
      const segment = connected && !unit && !activation ? `H${px}V${py}` : `${connected ? "L" : "M"}${px},${py}`;
      connected = true;
      return segment;
    }).join("");
    return { x, y, path, ticks: [min, (min + max) / 2, max], duration };
  }, [frames, lowerBound, unit, read, activation]);
  const frame = frames[index];
  const current = read(frame);
  const reading = Number.isFinite(current) ? format(current) : "Valeur absente";

  return <figure className={activation ? "network-chart network-history" : "network-chart"}>
    <figcaption>
      <strong>{label}</strong>
      <span className="network-number">{reading}{rank && ` · rang ${rank}`}</span>
    </figcaption>
    <svg viewBox="0 0 336 126" role="img"
         aria-label={`${label} au cours de l’épisode, ${reading} à ${NUMBER.format(frame.t)} s`}>
      {ticks.map((value) => <g key={value}>
        <line x1={LEFT} y1={y(value)} x2={RIGHT} y2={y(value)} stroke="var(--line-2)" />
        <text x={LEFT - 5} y={y(value)} textAnchor="end" dy=".35em">
          {activation ? NUMBER.format(value) : unit ? NUMBER.format(value) : PERCENT.format(value)}
        </text>
      </g>)}
      {[0, duration / 2, duration].map((time) => (
        <text key={time} x={x(time)} y={115} textAnchor="middle">{NUMBER.format(time)} s</text>
      ))}
      <path d={path} fill="none" stroke={color} strokeWidth={2} />
      <line x1={x(frame.t)} x2={x(frame.t)} y1={TOP} y2={BOTTOM} className="network-cursor" />
      {Number.isFinite(current) && <circle cx={x(frame.t)} cy={y(current)} r={4} fill={color} stroke="var(--text)" />}
    </svg>
  </figure>;
}

export function NeuronHistory({ frames, index, layer, neuron, rank }) {
  const metric = useMemo(() => ({
    label: `Couche ${layer + 1} · neurone ${neuron + 1}`,
    color: "var(--network-positive)",
    activation: true,
    read: (frame) => frame.activations?.[layer]?.[neuron],
  }), [layer, neuron]);
  return <EpisodeChart frames={frames} index={index} metric={metric} rank={rank} />;
}

export default function EpisodeCharts({ frames, index, mode }) {
  const metrics = [SPEED, STEER, ...(mode === "pedal" ? [PEDAL] : [THROTTLE, BRAKE])];
  return <section className="card">
    <h3 className="card-title">Vitesse et commandes au fil de l’épisode</h3>
    <div className="network-charts">
      {metrics.map((metric) => <EpisodeChart key={metric.label} metric={metric} frames={frames} index={index} />)}
    </div>
    <details className="network-details">
      <summary>En savoir plus sur les courbes</summary>
      <p>Le trait blanc suit l’image affichée. La vitesse est mesurée après la commande.</p>
      <p>{metrics.map(({ help }) => help).filter(Boolean).join(" ")}</p>
    </details>
  </section>;
}
