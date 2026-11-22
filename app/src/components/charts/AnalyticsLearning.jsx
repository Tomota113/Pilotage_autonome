import { useId, useMemo, useState } from "react";
import { aggregateLearning } from "../../data/analytics.js";
import { conditionColor, conditionLabel } from "../../data/algorithms.js";
import { axisNumber, ChartPanel, seedCount, shortPercent } from "./AnalyticsChart.jsx";
import LineChart, { formatNumber, formatPercent } from "./LineChart.jsx";

const METRICS = { lap_rate: "Taux de tours bouclés", mean_reward: "Récompense moyenne" };
const COMPACT_STEPS = new Intl.NumberFormat("fr-FR", { notation: "compact" });
const DASHES = [undefined, "5 3", "2 3"];

export default function AnalyticsLearning({ progress }) {
  const [metric, setMetric] = useState("lap_rate");
  const [choice, setChoice] = useState(null);
  const guideId = useId();
  const groups = useMemo(() => aggregateLearning(progress?.sources ?? [], metric), [progress, metric]);
  if (!progress) return <p className="card" role="status">Chargement des courbes…</p>;
  if (progress.error) return <p className="card warn" role="alert">Impossible de charger les entraînements.</p>;
  if (!groups.length) return <p className="card empty">Aucune mesure d’apprentissage disponible pour cette série.</p>;

  const { condition, seeds, average } = groups.find((group) => group.condition === choice) ?? groups[0];
  const points = groups.flatMap((group) => group.seeds.flatMap((seed) => seed.points));
  const maxStep = points.reduce((max, { x }) => Math.max(max, x), 0);
  const low = points.reduce((min, { y }) => Math.min(min, y), Infinity);
  const high = points.reduce((max, { y }) => Math.max(max, y), -Infinity);
  const padding = (high - low || Math.abs(high) || 1) * 0.08;
  const isRate = metric === "lap_rate";
  const exact = isRate ? formatPercent : formatNumber;
  const compact = isRate ? shortPercent : axisNumber;
  const label = conditionLabel(condition);
  const color = conditionColor(condition);
  const last = average.at(-1);
  const title = last
    ? `${label.split(" (")[0]} atteint ${compact(last.y)} ${isRate ? "de tours bouclés" : "de récompense moyenne"} à ${formatNumber(last.x)} pas`
    : `${METRICS[metric]} pendant l’entraînement de ${label}`;
  const lines = [
    ...seeds.map((seed, index) => ({ ...seed, color, strokeWidth: 1.5, opacity: 0.9, dash: DASHES[index % DASHES.length] })),
    ...(average.length ? [{ name: "Moyenne", points: average, color: "var(--text)", strokeWidth: 2.8 }] : []),
  ];

  return <ChartPanel title={title}
    guide="Les traits fins suivent des graines distinctes. Le trait épais donne leur moyenne aux pas mesurés pour toutes les graines. Les axes restent identiques entre agents pour la mesure choisie. Une récompense qui monte ne garantit pas que l’agent boucle plus de tours sur des circuits inconnus."
    table={{ columns: ["Courbe", "Pas d’entraînement", METRICS[metric]],
      rows: lines.flatMap(({ name, points }) => points.map(({ x, y }) => [name, formatNumber(x), exact(y)])) }}>
    <div className="analytics-learning-controls">
      <label className="field analytics-select">Agent
        <select value={condition} onChange={(event) => setChoice(event.target.value)}>
          {groups.map((group) => <option key={group.condition} value={group.condition}>{conditionLabel(group.condition)}</option>)}
        </select>
      </label>
      <label className="field analytics-select">Mesure affichée
        <select value={metric} onChange={(event) => setMetric(event.target.value)}>
          {Object.entries(METRICS).map(([id, metricLabel]) => <option key={id} value={id}>{metricLabel}</option>)}
        </select>
      </label>
    </div>
    {progress.missing > 0 && <p className="warn">Progression indisponible pour {progress.missing} entraînement(s).</p>}
    <p className="note" id={guideId}>{seedCount(seeds.length)}{average.length > 0 && " · Moyenne en trait épais"}</p>
    <div className="analytics-line-wide">
      <LineChart label={METRICS[metric]} xLabel="Pas d’entraînement" descriptionId={guideId}
        xTicks={[...new Set([0, Math.round(maxStep / 2), maxStep])]} xFormat={(value) => COMPACT_STEPS.format(value)}
        yDomain={isRate ? [0, 1] : [low - padding, high + padding]} yFormat={compact}
        tooltipXFormat={(value) => `${formatNumber(value)} pas`} tooltipYFormat={exact} series={lines} width={600} height={210} />
    </div>
  </ChartPanel>;
}
