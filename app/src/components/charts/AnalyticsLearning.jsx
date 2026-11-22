import { useId, useMemo, useState } from "react";
import { aggregateLearning } from "../../data/analytics.js";
import { conditionColor, conditionLabel } from "../../data/algorithms.js";
import { axisNumber, ChartTable, Condition, Legend, seedCount, shortPercent } from "./AnalyticsChart.jsx";
import LineChart, { formatNumber, formatPercent } from "./LineChart.jsx";

const METRICS = { lap_rate: "Taux de tours bouclés", mean_reward: "Récompense moyenne" };
const COMPACT_STEPS = new Intl.NumberFormat("fr-FR", { notation: "compact" });
const DASHES = [undefined, "5 3", "2 3"];

export default function AnalyticsLearning({ progress }) {
  const [metric, setMetric] = useState("lap_rate");
  const guideId = useId();
  const groups = useMemo(() => aggregateLearning(progress?.sources ?? [], metric), [progress, metric]);
  const points = groups.flatMap(({ seeds }) => seeds.flatMap((seed) => seed.points));
  const maxStep = points.reduce((max, { x }) => Math.max(max, x), 0);
  const low = points.reduce((min, { y }) => Math.min(min, y), Infinity);
  const high = points.reduce((max, { y }) => Math.max(max, y), -Infinity);
  const padding = (high - low || Math.abs(high) || 1) * 0.08;
  const isRate = metric === "lap_rate";
  const exact = isRate ? formatPercent : formatNumber;
  return <section className="card analytics-chart" aria-labelledby={`${guideId}-title`}>
    <h3 id={`${guideId}-title`} className="card-title">Que change l’entraînement ?</h3>
    <p className="analytics-guide" id={guideId}><strong>Comment lire ce graphique.</strong> On avance vers la droite à mesure que l’agent s’entraîne.
      Les traits fins suivent des graines distinctes. Le trait épais donne leur moyenne, uniquement aux pas où toutes ont été mesurées.
      Une récompense qui monte ne garantit pas que l’agent boucle plus de tours sur des circuits inconnus.</p>
    <label className="field analytics-select">Mesure affichée
      <select value={metric} onChange={(event) => setMetric(event.target.value)}>
        {Object.entries(METRICS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
    </label>
    <Legend items={[{ label: "Une graine (traits fins)", color: "var(--muted)", mark: "dash" },
      { label: "Moyenne (trait épais)", color: "var(--text)", mark: "line" }]} />
    {!progress ? <p role="status">Chargement des courbes…</p>
      : progress.error ? <p className="warn" role="alert">Impossible de charger les entraînements.</p>
      : !groups.length ? <p className="empty">Aucune mesure d’apprentissage disponible pour cette série.</p>
      : <>
        {progress.missing > 0 && <p className="warn">Fichier de progression indisponible pour {progress.missing} entraînement(s).</p>}
        <p className="note">Les graphiques utilisent les mêmes axes pour la mesure choisie. Une courbe qui finit plus tôt correspond à un entraînement mesuré sur moins de pas.</p>
        <div className="analytics-multiples">
          {groups.map(({ condition, seeds, average }) => {
            const color = conditionColor(condition);
            const lines = [
              ...seeds.map((seed, index) => ({ ...seed, color, strokeWidth: 1.4, opacity: 0.8, dash: DASHES[index % DASHES.length] })),
              ...(average.length ? [{ name: "Moyenne", points: average, color: "var(--text)", strokeWidth: 2.7 }] : []),
            ];
            return <article className="analytics-multiple" key={condition}>
              <h4><Condition id={condition} short /></h4>
              <p className="note">{seedCount(seeds.length)} · {seeds.length === 1 ? "la moyenne se confond avec la courbe" : METRICS[metric]}</p>
              <LineChart label={METRICS[metric]} xLabel="Pas d’entraînement" descriptionId={guideId}
                xTicks={[...new Set([0, Math.round(maxStep / 2), maxStep])]} xFormat={(value) => COMPACT_STEPS.format(value)}
                yDomain={isRate ? [0, 1] : [low - padding, high + padding]} yFormat={isRate ? shortPercent : axisNumber}
                tooltipXFormat={(value) => `${formatNumber(value)} pas`} tooltipYFormat={exact} series={lines} />
              <ChartTable title={`${conditionLabel(condition)} · ${METRICS[metric]}`} columns={["Courbe", "Pas d’entraînement", METRICS[metric]]}
                rows={lines.flatMap(({ name, points }) => points.map(({ x, y }) => [name, formatNumber(x), exact(y)]))} />
            </article>;
          })}
        </div>
      </>}
  </section>;
}
