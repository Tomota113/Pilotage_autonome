import { useMemo } from "react";
import { pedalValue } from "../../data/network.js";

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

function EpisodeChart({ frames, index, metric }) {
  const { label, unit, color, read, help, min = 0 } = metric;
  const { x, y, path, ticks, duration } = useMemo(() => {
    const duration = frames.at(-1).t || 1;
    const max = unit ? Math.ceil(frames.reduce((peak, frame) => Math.max(peak, read(frame)), 50) / 50) * 50 : 1;
    const x = (time) => LEFT + (time / duration) * (RIGHT - LEFT);
    const y = (value) => BOTTOM - ((value - min) / (max - min)) * (BOTTOM - TOP);
    const path = frames.map((frame, i) => {
      const px = x(frame.t).toFixed(2);
      const py = y(read(frame)).toFixed(2);
      // Une commande reste fixe entre deux décisions.
      if (i && !unit) return `H${px}V${py}`;
      return `${i ? "L" : "M"}${px},${py}`;
    }).join("");
    return { x, y, path, ticks: [min, (min + max) / 2, max], duration };
  }, [frames, min, unit, read]);
  const frame = frames[index];
  const current = read(frame);

  return <figure className="network-chart">
    <figcaption><strong>{label}</strong> <span className="network-number">{formatValue(current, unit)}</span></figcaption>
    <svg viewBox="0 0 336 126" role="img"
         aria-label={`${label} au cours de l’épisode, ${formatValue(current, unit)} à ${NUMBER.format(frame.t)} s`}>
      {ticks.map((value) => <g key={value}>
        <line x1={LEFT} y1={y(value)} x2={RIGHT} y2={y(value)} stroke="var(--line-2)" />
        <text x={LEFT - 5} y={y(value)} textAnchor="end" dy=".35em">
          {unit ? NUMBER.format(value) : PERCENT.format(value)}
        </text>
      </g>)}
      {[0, duration / 2, duration].map((time) => (
        <text key={time} x={x(time)} y={115} textAnchor="middle">{NUMBER.format(time)} s</text>
      ))}
      <path d={path} fill="none" stroke={color} strokeWidth={2} />
      <line x1={x(frame.t)} x2={x(frame.t)} y1={TOP} y2={BOTTOM} className="network-cursor" />
      <circle cx={x(frame.t)} cy={y(current)} r={4} fill={color} stroke="var(--text)" />
    </svg>
    {help && <p className="note">{help}</p>}
  </figure>;
}

export default function EpisodeCharts({ frames, index, mode }) {
  const metrics = [SPEED, STEER, ...(mode === "pedal" ? [PEDAL] : [THROTTLE, BRAKE])];
  return <section className="card">
    <h3 className="card-title">Vitesse et commandes au fil de l’épisode</h3>
    <p className="note">Le trait blanc suit le curseur temporel. La vitesse du graphique est mesurée après la commande.</p>
    <div className="network-charts">
      {metrics.map((metric) => <EpisodeChart key={metric.label} metric={metric} frames={frames} index={index} />)}
    </div>
  </section>;
}
