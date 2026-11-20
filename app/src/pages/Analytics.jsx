import { useEffect, useMemo, useState } from "react";
import { ALGO_LABELS } from "../data/algorithms.js";
import { getMode, listRuns, loadEval, loadProgress } from "../data/api.js";

const COLORS = {
  ppo: "#3987e5", dqn: "#199e70", sac: "#c98500", qlearning: "#d55181",
  sarsa: "#9085e9", montecarlo: "#e66767", classic: "#8c8b84",
};
const DASHES = [undefined, "7 4", "2 4", "8 3 2 3"];
const MODE_LABELS = { fixed: "μ fixe", uniform: "μ aléatoire" };
const METRICS = {
  mean_reward: { label: "Récompense moyenne", scale: 1 },
  lap_rate: { label: "Taux de tours valides (%)", scale: 100 },
  mean_lap_time: { label: "Temps moyen d’un tour valide (s)", scale: 1 },
  offtracks_per_ep: { label: "Sorties de piste par épisode", scale: 1 },
};
const FORMAT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
const STEPS = new Intl.NumberFormat("fr-FR");
function algoLabel(algo) {
  if (algo === "classic") return "Pilote classique (référence)";
  return Object.hasOwn(ALGO_LABELS, algo) ? ALGO_LABELS[algo] : algo.toUpperCase();
}

const asNumber = (value) => value === "" || value == null ? NaN : Number(value);
const sortedOptions = (values) => [...new Set(values.filter((value) => value != null && value !== ""))]
  .sort((a, b) => typeof a === "number" ? a - b : a.localeCompare(b));

function stats(values) {
  if (!values.length) return { mean: null, deviation: null, count: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return { mean, deviation: values.length > 1 ? Math.sqrt(variance) : 0, count: values.length };
}

async function hasNoPenalty(runId, mode) {
  // agents.train enregistre le YAML avec safe_dump, dont les paramètres de reward sont sur des lignes distinctes.
  if (mode === "server") {
    try {
      const response = await fetch(`/files/runs/${encodeURIComponent(runId)}/config.yaml`);
      if (response.ok) {
        const text = await response.text();
        const lambda = text.match(/^ {2}lambda_steer:\s*([^\s#]+)/m)?.[1];
        if (lambda != null && Number.isFinite(Number(lambda))) return Number(lambda) === 0;
      }
    } catch {
      // Certains runs historiques ne livrent que les CSV.
    }
  }
  return /(?:^|_)nolambda(?:_|$)/.test(runId) ? true : null;
}

export function aggregateLearning(sources, metricKey) {
  const { scale } = METRICS[metricKey];
  const groups = new Map();
  for (const { rows, noPenalty } of sources) {
    const { run_id: runId, algo, seed, mu_mode: muMode } = rows[0];
    const base = runId.replace(/_s\d+_\d{8}-\d{4}(?=_|$)/, "");
    const key = JSON.stringify([base, algo, muMode, noPenalty]);
    if (!groups.has(key)) groups.set(key, { base, algo, muMode, noPenalty, runs: new Map() });
    const { runs } = groups.get(key);
    // Comme les figures Python, retenir le run daté le plus récent pour une même graine.
    if (!runs.has(seed) || runId > runs.get(seed)[0].run_id) runs.set(seed, rows);
  }
  const dashIndices = new Map();
  return [...groups.entries()].map(([key, { base, algo, muMode, noPenalty, runs }]) => {
    const steps = new Map();
    for (const rows of runs.values()) {
      const values = new Map(rows.map((row) => [asNumber(row.step), asNumber(row[metricKey])]));
      for (const [step, value] of values) {
        if (!Number.isFinite(step)) continue;
        if (!steps.has(step)) steps.set(step, []);
        steps.get(step).push(value);
      }
    }
    const points = [...steps]
      .filter(([, values]) => values.length === runs.size)
      .sort(([a], [b]) => a - b)
      .map(([step, values]) => ({ step, ...stats(values.filter(Number.isFinite).map((value) => value * scale)) }));
    const dashIndex = dashIndices.get(algo) ?? 0;
    dashIndices.set(algo, dashIndex + 1);
    const condition = noPenalty === true ? " · sans pénalité" : noPenalty == null ? " · λ inconnu" : "";
    const name = base.startsWith(`${algo}_`) ? base.slice(algo.length + 1) : base;
    return { key, label: `${algoLabel(algo)} · ${name} · ${MODE_LABELS[muMode] ?? muMode}${condition}`, algo, points,
      seeds: runs.size, dash: DASHES[dashIndex % DASHES.length] };
  });
}

export function aggregateEvaluation(rows) {
  const byAlgo = new Map();
  for (const row of rows) {
    if (!byAlgo.has(row.algo)) byAlgo.set(row.algo, new Map());
    const seeds = byAlgo.get(row.algo);
    if (!seeds.has(row.seed)) seeds.set(row.seed, []);
    seeds.get(row.seed).push(row);
  }
  return [...byAlgo].map(([algo, seeds]) => {
    const means = (metric) => stats([...seeds.values()].map((rows) =>
      stats(rows.map(metric).filter(Number.isFinite)).mean).filter(Number.isFinite));
    return {
      algo,
      episodes: [...seeds.values()].reduce((count, rows) => count + rows.length, 0),
      lap_rate: means((row) => row.outcome === "lap" ? 100 : 0),
      mean_lap_time: means((row) => row.outcome === "lap" ? asNumber(row.lap_time) : NaN),
      offtracks_per_ep: means((row) => asNumber(row.offtracks)),
    };
  }).sort((a, b) => Object.keys(COLORS).indexOf(a.algo) - Object.keys(COLORS).indexOf(b.algo));
}

const PLOT = { left: 70, right: 728, top: 18, bottom: 215 };
const COLOR = (algo) => COLORS[algo] ?? "var(--muted)";

function Chart({ label, min, max, children }) {
  const y = (value) => PLOT.bottom - (value - min) / (max - min) * (PLOT.bottom - PLOT.top);
  return (
    <svg className="module-chart" viewBox="0 0 750 260" role="img" aria-label={label}>
      {Array.from({ length: 5 }, (_, i) => {
        const value = min + (max - min) * i / 4;
        return <g key={i}>
          <line x1={PLOT.left} x2={PLOT.right} y1={y(value)} y2={y(value)} stroke="var(--line)" />
          <text x={PLOT.left - 8} y={y(value)} dy=".35em" textAnchor="end">{FORMAT.format(value)}</text>
        </g>;
      })}
      <line x1={PLOT.left} x2={PLOT.left} y1={PLOT.top} y2={PLOT.bottom} stroke="var(--line)" />
      {children(y)}
    </svg>
  );
}

function Legend({ items }) {
  return (
    <ul className="module-legend" aria-label="Légende">
      {items.map(({ key, algo, label, dash }) => (
        <li key={key}>
          <svg width="24" height="10" aria-hidden="true">
            <line x1="0" x2="24" y1="5" y2="5" strokeWidth="3" stroke={COLOR(algo)} strokeDasharray={dash} />
          </svg>
          {label}
        </li>
      ))}
    </ul>
  );
}

function ChartTable({ label, headers, rows }) {
  return (
    <div className="module-table" tabIndex={0} role="region" aria-label={label}>
      <table aria-label={label}>
        <thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

function LearningChart({ series, metric }) {
  const plotted = series.filter(({ points }) => points.some(({ mean }) => mean !== null));
  if (!plotted.length) return <p className="empty">Aucune valeur comparable pour cette métrique et ces filtres.</p>;
  const points = plotted.flatMap((item) => item.points.filter(({ mean }) => mean !== null));
  const [min, max, first, last] = points.reduce(([low, high, start, end], point) => [
    Math.min(low, point.mean - point.deviation), Math.max(high, point.mean + point.deviation),
    Math.min(start, point.step), Math.max(end, point.step),
  ], [Infinity, -Infinity, Infinity, -Infinity]);
  const padding = (max - min || Math.abs(max) || 1) * 0.08;
  const x = (step) => first === last ? (PLOT.left + PLOT.right) / 2
    : PLOT.left + (step - first) / (last - first) * (PLOT.right - PLOT.left);
  const tickSteps = first === last ? [first] : sortedOptions(Array.from({ length: 5 }, (_, i) => Math.round(first + (last - first) * i / 4)));

  return (
    <>
      <Chart label={metric.label} min={min - padding} max={max + padding}>
        {(y) => (
          <>
            {tickSteps.map((step) => <text key={step} x={x(step)} y="232" textAnchor="middle">{STEPS.format(step)}</text>)}
            <text x="399" y="252" textAnchor="middle">Pas d’entraînement</text>
            {plotted.map((item) => {
              const segments = [[]];
              for (const point of item.points) {
                if (point.mean == null) segments.push([]);
                else segments.at(-1).push(point);
              }
              return (
                <g key={item.key}>
                  {segments.filter((segment) => segment.length).map((segment) => {
                    const coordinates = (data, position) => data.map((point) => `${x(point.step)},${y(position(point))}`).join(" ");
                    const upper = coordinates(segment, (point) => point.mean + point.deviation);
                    const lower = coordinates(segment.slice().reverse(), (point) => point.mean - point.deviation);
                    return (
                      <g key={segment[0].step}>
                        <polygon points={`${upper} ${lower}`} fill={COLOR(item.algo)} fillOpacity=".17" />
                        <polyline points={coordinates(segment, (point) => point.mean)} fill="none"
                                  stroke={COLOR(item.algo)} strokeWidth="2" strokeDasharray={item.dash} />
                        {segment.map((point) => (
                          <g key={point.step}>
                            <line x1={x(point.step)} x2={x(point.step)} y1={y(point.mean - point.deviation)}
                                  y2={y(point.mean + point.deviation)} stroke={COLOR(item.algo)} opacity=".55" />
                            <circle cx={x(point.step)} cy={y(point.mean)} r="4" fill={COLOR(item.algo)}>
                              <title>{`${item.label} · ${STEPS.format(point.step)} pas · ${FORMAT.format(point.mean)} ± ${FORMAT.format(point.deviation)} · ${point.count} graine(s)`}</title>
                            </circle>
                          </g>
                        ))}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </>
        )}
      </Chart>
      {plotted.length >= 2 && <Legend items={plotted} />}
      <ChartTable label={`Valeurs d’apprentissage · ${metric.label}`}
                  headers={["Condition", "Pas", "Moyenne", "Écart-type", "Graines"]}
                  rows={series.flatMap((item) => item.points.map((point) => (
                    <tr key={`${item.key}-${point.step}`}>
                      <th scope="row">{item.label}</th><td>{STEPS.format(point.step)}</td>
                      <td>{point.mean == null ? "—" : FORMAT.format(point.mean)}</td>
                      <td>{point.deviation == null ? "—" : FORMAT.format(point.deviation)}</td>
                      <td>{point.count} / {item.seeds}</td>
                    </tr>
                  )))} />
    </>
  );
}

function EvaluationChart({ entries, metricKey }) {
  const { label } = METRICS[metricKey];
  const plotted = entries.filter((entry) => entry[metricKey].mean !== null);
  const max = metricKey === "lap_rate" ? 100 : Math.max(0, ...plotted.map((entry) => entry[metricKey].mean)) * 1.1 || 1;
  const slot = (PLOT.right - PLOT.left) / Math.max(1, entries.length);
  const barWidth = Math.min(72, slot * 0.55);
  const legend = plotted.map(({ algo }) => ({ algo, key: algo, label: algoLabel(algo) }));
  return (
    <section className="panel module-section">
      <h4>{label}</h4>
      {plotted.length ? (
        <Chart label={label} min={0} max={max}>
          {(y) => entries.map(({ algo, [metricKey]: { mean, count } }, index) => {
            const center = PLOT.left + (index + 0.5) * slot;
            const height = mean == null ? 0 : Math.max(2, PLOT.bottom - y(mean));
            return (
              <g key={algo}>
                {mean != null && <rect x={center - barWidth / 2} y={PLOT.bottom - height} width={barWidth} height={height}
                                      fill={COLOR(algo)}>
                  <title>{`${algoLabel(algo)} · ${FORMAT.format(mean)} · ${count} graine(s)`}</title>
                </rect>}
                <text x={center} y="232" textAnchor="middle">{algo === "classic" ? "Classique" : algoLabel(algo)}</text>
              </g>
            );
          })}
        </Chart>
      ) : <p className="empty">Aucune valeur pour cette métrique.</p>}
      {legend.length >= 2 && <Legend items={legend} />}
      <ChartTable label={`Valeurs d’évaluation · ${label}`} headers={["Algorithme", "Moyenne", "Écart-type", "Graines", "Épisodes filtrés"]}
                  rows={entries.map(({ algo, episodes, [metricKey]: { mean, deviation, count } }) => (
                    <tr key={algo}>
                      <th scope="row">{algoLabel(algo)}</th><td>{mean == null ? "—" : FORMAT.format(mean)}</td>
                      <td>{deviation == null ? "—" : FORMAT.format(deviation)}</td><td>{count}</td><td>{episodes}</td>
                    </tr>
                  ))} />
    </section>
  );
}

function Filter({ label, value, onChange, options, format = (value) => value }) {
  return (
    <label className="module-field">{label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Tous</option>
        {options.map((option) => <option key={option} value={option}>{format(option)}</option>)}
      </select>
    </label>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState("mean_reward");
  const [filters, setFilters] = useState({ algo: "", mu_mode: "", track_id: "", split: "", mu_factor: "" });

  useEffect(() => {
    let active = true;
    const readLearning = async () => {
      const [runs, mode] = await Promise.all([listRuns(), getMode()]);
      const sources = await Promise.all(runs.map(async ({ run_id: id }) => {
        const rows = await loadProgress(id);
        if (!rows.length) return null;
        return { rows, noPenalty: await hasNoPenalty(id, mode) };
      }));
      return sources.filter(Boolean);
    };
    Promise.allSettled([readLearning(), loadEval()]).then(([learning, evaluation]) => {
      if (!active) return;
      if (learning.status === "rejected" || evaluation.status === "rejected") {
        setError("Une partie des données n’a pas pu être chargée.");
      }
      setData({ learning: learning.value ?? [], evaluation: evaluation.value ?? [] });
    });
    return () => { active = false; };
  }, []);

  const series = useMemo(() => {
    const selected = (data?.learning ?? []).filter(({ rows: [row] }) =>
      (!filters.algo || row.algo === filters.algo) && (!filters.mu_mode || row.mu_mode === filters.mu_mode));
    return aggregateLearning(selected, metric);
  }, [data, filters.algo, filters.mu_mode, metric]);

  const evaluation = useMemo(() => aggregateEvaluation((data?.evaluation ?? []).filter((row) =>
    Object.entries(filters).every(([key, value]) => !value || String(row[key]) === value))), [data, filters]);

  const filter = (key, label, options, format) => (
    <Filter label={label} options={sortedOptions(options)} format={format} value={filters[key]}
            onChange={(value) => setFilters({ ...filters, [key]: value })} />
  );
  const metadata = data ? [...data.evaluation, ...data.learning.map(({ rows }) => rows[0])] : [];

  return (
    <>
      <h2>Analyse des performances</h2>
      {error && <p className="warn" role="alert">{error}</p>}
      {!data && <p className="empty" role="status">Chargement des données…</p>}
      {data && (
        <>
          <div className="controls analytics-filters" aria-label="Filtres de performance">
            {filter("algo", "Algorithme", metadata.map((row) => row.algo), algoLabel)}
            {filter("mu_mode", "Condition", metadata.map((row) => row.mu_mode), (mode) => MODE_LABELS[mode] ?? mode)}
            {filter("track_id", "Circuit", data.evaluation.map((row) => row.track_id))}
            {filter("split", "Split", data.evaluation.map((row) => row.split))}
            {filter("mu_factor", "Facteur μ", data.evaluation.map((row) => asNumber(row.mu_factor)).filter(Number.isFinite), FORMAT.format)}
          </div>
          <p className="note">Circuit, split et facteur μ filtrent uniquement l’évaluation.</p>
          <section className="panel module-section">
            <h3>Courbes d’apprentissage</h3>
            <label className="module-field analytics-metric">Métrique
              <select value={metric} onChange={(event) => setMetric(event.target.value)}>
                {Object.entries(METRICS).map(([key, { label }]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            {data.learning.length ? (
              <>
                <p className="note">Moyenne ± écart-type entre graines aux pas évalués en commun.</p>
                <LearningChart series={series} metric={METRICS[metric]} />
              </>
            ) : <p className="empty">Aucun progress.csv. Lancez <code>.venv/bin/python -m agents.train configs/ppo_demo.yaml</code>.</p>}
          </section>
          <h3>Évaluation par algorithme</h3>
          {evaluation.length > 0 && (
            <>
              <p className="note">Moyenne par graine, puis entre graines. Le temps au tour utilise uniquement les tours valides.</p>
              {["lap_rate", "mean_lap_time", "offtracks_per_ep"].map((key) =>
                <EvaluationChart key={key} metricKey={key} entries={evaluation} />)}
            </>
          )}
          {!evaluation.length && (data.evaluation.length
            ? <p className="empty">Aucun épisode d’évaluation pour ces filtres.</p>
            : <p className="empty">Aucun eval.csv. Pour évaluer tout le protocole, lancez <code>.venv/bin/python -m tools.evaluate_all</code>.
                Pour l’ovale de démonstration, utilisez <code>.venv/bin/python -m agents.evaluate runs/&lt;run_id&gt;/checkpoints/&lt;fichier&gt; --tracks demo_oval</code>.</p>)}
        </>
      )}
    </>
  );
}
