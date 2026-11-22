import { useId, useState } from "react";
import { CONDITION_BY_ID, conditionColor, conditionLabel, muLabel } from "../../data/algorithms.js";
import { formatNumber, formatPercent } from "./LineChart.jsx";

const AXIS = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const PERCENT = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });
const ADHESION = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1 });
export const axisNumber = (value) => AXIS.format(value);
export const shortPercent = (value) => PERCENT.format(value);
export const muTick = (value) => `μ ${ADHESION.format(value)}`;
export const countLabel = ({ laps, attempts }) => `${laps} / ${attempts}`;
export const rateLabel = (entry) => entry ? `${formatPercent(entry.rate)} (${countLabel(entry)})` : "—";
export const trialLabel = (seed) => typeof seed === "number" ? `Graine ${seed}` : `Essai ${seed}`;
export const seedCount = (count) => `${count} ${count === 1 ? "graine" : "graines"}`;

export function conditionShort(id) {
  if (id === "ppo_f1") return "PPO 2×256";
  return CONDITION_BY_ID[id]?.short ?? conditionLabel(id);
}

export function leaderTitle(entries, value, conclusion, fallback, compare = Math.max) {
  if (!entries.length) return fallback;
  const best = compare(...entries.map(value));
  const leaders = entries.filter((entry) => value(entry) === best);
  if (leaders.length !== 1 || best <= 0) return fallback;
  return `${conditionLabel(leaders[0].condition).split(" (")[0]} ${conclusion(best)}`;
}

export function Condition({ id, short = false }) {
  return <span title={short ? conditionLabel(id) : undefined}>
    <span aria-hidden="true" className="swatch" style={{ background: conditionColor(id) }} />
    {short ? conditionShort(id) : conditionLabel(id)}
  </span>;
}

export function Legend({ items }) {
  return <ul className="analytics-legend" aria-label="Légende">
    {items.map(({ label, color, mark }) => <li key={label}>
      <span aria-hidden="true" className={`analytics-key ${mark ?? ""}`} style={{ "--chart-color": color }} />{label}
    </li>)}
  </ul>;
}

export function ChartTable({ title, columns, rows }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="analytics-table-toggle">
    <button type="button" aria-expanded={open} aria-controls={id} aria-label={`${open ? "Masquer" : "Voir"} le tableau : ${title}`}
            onClick={() => setOpen(!open)}>{open ? "Masquer le tableau" : "Voir le tableau"}</button>
    <div id={id} hidden={!open} className="analytics-scroll" role="region" aria-label={title} tabIndex={0}>
      {open && <table>
        <caption>{title}</caption>
        <thead><tr>{columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map(([first, ...cells], index) => <tr key={index}>
          <th scope="row">{first}</th>{cells.map((cell, index) => <td key={index}>{cell}</td>)}
        </tr>)}</tbody>
      </table>}
    </div>
  </div>;
}

export function ChartPanel({ title, guide, legend, table, children }) {
  const id = useId();
  return <section className="card analytics-chart" aria-labelledby={`${id}-title`} aria-describedby={`${id}-guide`}>
    <h3 id={`${id}-title`} className="card-title">{title}</h3>
    {legend && <Legend items={legend} />}
    {children}
    <div className="analytics-chart-footer">
      {table && <ChartTable title={title} {...table} />}
      <details className="explanation">
        <summary>En savoir plus</summary>
        <p id={`${id}-guide`}>{guide}</p>
      </details>
    </div>
  </section>;
}

export function MuPicker({ values, value, onChange }) {
  return <label className="field analytics-select">Adhérence affichée
    <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
      {values.map((mu) => <option key={mu} value={mu}>{muLabel(mu)}</option>)}
    </select>
  </label>;
}

export function HorizontalPlot({ title, unit, min = 0, max, ticks, tickFormat = formatNumber, children }) {
  return <div className="analytics-plot" role="img" aria-label={`${title} — ${unit}`}>
    <div className="analytics-axis" aria-hidden="true">
      <div className="analytics-axis-body">
        {ticks.map((tick) => <span key={tick} style={{ left: position(tick, max, min) }}>{tickFormat(tick)}</span>)}
      </div>
      <small>{unit}</small>
    </div>
    {children}
  </div>;
}

export function PlotRow({ condition, report, children, height = 23 }) {
  return <div className="analytics-plot-row">
    <div className="analytics-plot-name"><Condition id={condition} short /></div>
    <svg width="100%" height={height} aria-hidden="true" className="analytics-plot-svg">{children}</svg>
    <div className="analytics-plot-report">{report}</div>
  </div>;
}

export const position = (value, max, min = 0) => `${(value - min) / (max - min) * 100}%`;

export function Segments({ segments, max, y = 4, height = 15, emptyTip }) {
  let offset = 0;
  return <>
    <rect width="100%" y={y} height={height} fill="var(--panel-3)"><title>{emptyTip}</title></rect>
    {segments.map(({ value, color, tip }, index) => {
      const x = position(offset, max);
      offset += value;
      return value > 0 && <rect key={index} x={x} y={y} width={position(value, max)} height={height} fill={color}>
        <title>{tip}</title>
      </rect>;
    })}
  </>;
}
