import { useMemo } from "react";
import { passageAt, progressTimeline } from "../../data/interpolate.js";
import { pedalValue } from "./RaceUI.jsx";

const W = 410;
const H = 108;
const LEFT = 37;
const RIGHT = 394;
const TOP = 10;
const BOTTOM = 82;
const VIEWS = {
  speed: { label: "Vitesse", unit: "km/h", color: "var(--info)", value: (frame) => frame.v * 3.6 },
  steering: { label: "Volant", unit: "%", color: "var(--chart-teal)", value: (frame) => -frame.action.steer * 100 },
  pedal: { label: "Pédale", unit: "%", color: "var(--good)", value: (frame) => pedalValue(frame.action) * 100 },
  throttle: { label: "Gaz", color: "var(--good)", value: (frame) => frame.action.throttle * 100 },
  brake: { label: "Frein", color: "var(--bad)", value: (frame) => frame.action.brake * 100 },
};
const NUMBER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const distance = (frame, length) => Math.max(0, (frame.progress ?? 0) * length);

function profile(frames, x, y, value) {
  return frames.map((frame, i) => `${i ? "L" : "M"}${x(frame).toFixed(1)},${y(value(frame)).toFixed(1)}`).join("");
}

function makePlots(frames, ghost, length, mode) {
  const all = [frames, ghost];
  const maxDistance = Math.max(1, ...all.map((series) => series.reduce((max, frame) => Math.max(max, distance(frame, length)), 0)));
  const speedMax = Math.max(1, ...all.map((series) => series.reduce((max, frame) => Math.max(max, VIEWS.speed.value(frame)), 0)));
  const tickStep = speedMax <= 100 ? 10 : 50;
  const speedLimit = Math.ceil(speedMax / tickStep) * tickStep;
  const x = (frame) => LEFT + distance(frame, length) / maxDistance * (RIGHT - LEFT);

  return ["speed", "steering", mode === "pedal" ? "pedal" : "throttle"].map((key) => {
    const primary = VIEWS[key];
    const signed = key === "steering" || key === "pedal";
    const min = signed ? -100 : 0;
    const max = key === "speed" ? speedLimit : 100;
    const y = (value) => BOTTOM - (value - min) * (BOTTOM - TOP) / (max - min);
    return {
      key, x, y, ticks: [min, (max + min) / 2, max],
      horizontal: [0, 0.5, 1].map((ratio) => ({
        x: LEFT + ratio * (RIGHT - LEFT),
        text: NUMBER.format(maxDistance * ratio / 1000),
      })),
      label: key === "throttle" ? "Gaz / Frein" : primary.label,
      unit: primary.unit ?? "%",
      series: (key === "throttle" ? [primary, VIEWS.brake] : [primary]).map((spec) => ({
        ...spec, path: profile(frames, x, y, spec.value), ghostPath: profile(ghost, x, y, spec.value),
      })),
      maxDistance,
    };
  });
}

function Trace({ plot, frame, onDistance }) {
  const { x, y, ticks, horizontal, series, label, unit, maxDistance } = plot;
  const cursor = x(frame);
  return <div className="telemetry-trace">
    <h4>{label} <span>{unit}</span></h4>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} selon la distance sur le circuit`}
         onClick={(event) => {
           const bounds = event.currentTarget.getBoundingClientRect();
           const px = (event.clientX - bounds.left) * W / bounds.width;
           onDistance(maxDistance * (px - LEFT) / (RIGHT - LEFT));
         }}>
      {ticks.map((tick) => <g key={tick}>
        <line x1={LEFT} x2={RIGHT} y1={y(tick)} y2={y(tick)} className="telemetry-grid" />
        <text x={LEFT - 6} y={y(tick) + 4} textAnchor="end">{tick}</text>
      </g>)}
      {horizontal.map((tick, index) => <g key={tick.x}>
        <line x1={tick.x} x2={tick.x} y1={TOP} y2={BOTTOM} className="telemetry-grid" />
        <text x={tick.x} y={101} textAnchor={index === 2 ? "end" : "middle"}>{tick.text}{index === 2 ? " km" : ""}</text>
      </g>)}
      {series.map(({ label: name, color, path, ghostPath }) => <g key={name}>
        {ghostPath && <path d={ghostPath} className="telemetry-ghost" style={{ "--ghost-color": series.length > 1 ? color : undefined }} />}
        <path d={path} className="telemetry-line" stroke={color} />
      </g>)}
      <line x1={cursor} x2={cursor} y1={TOP} y2={BOTTOM} className="telemetry-cursor" />
      {series.map(({ label: name, value, color }) => <circle key={name} cx={cursor} cy={y(value(frame))} r="3.4" fill={color} />)}
    </svg>
  </div>;
}

const EMPTY = [];

export default function Telemetry({ replay, ghost, length = 0, index, mode, onSeek }) {
  const frames = replay.frames;
  const ghostFrames = ghost?.frames ?? EMPTY;
  const plots = useMemo(() => makePlots(frames, ghostFrames, length, mode), [frames, ghostFrames, length, mode]);
  const timeline = useMemo(() => progressTimeline(frames), [frames]);
  function seekDistance(metres) {
    if (!length || !timeline.length) return;
    const progress = Math.max(timeline[0].progress, Math.min(timeline.at(-1).progress, metres / length));
    onSeek(passageAt(timeline, progress).index);
  }
  return <section className="card race-telemetry">
    <header>
      <h3>Télémétrie</h3>
      <div className="telemetry-keys">
        <span>Distance sur le circuit</span>
        {ghost && <span className="ghost-key">Fantôme</span>}
        {mode !== "pedal" && <span className="pedal-key"><i /> Gaz <i /> Frein</span>}
      </div>
    </header>
    <div className="telemetry-grid-layout">
      {plots.map((plot) => <Trace key={plot.key} plot={plot} frame={frames[index]} onDistance={seekDistance} />)}
    </div>
  </section>;
}
