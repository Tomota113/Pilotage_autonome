import { useId, useState } from "react";
import { conditionColor, conditionLabel, OUTCOME_LABELS } from "../../data/algorithms.js";
import { isReference, OUTCOMES, summarizeCircuits, summarizeLapRatios, summarizeShowcase, trialSeed } from "../../data/analytics.js";
import LineChart, { formatNumber, formatPercent } from "./LineChart.jsx";
import {
  axisNumber, ChartPanel, Condition, conditionShort, countLabel, HorizontalPlot, MuPicker, muTick,
  PlotRow, position, rateLabel, seedCount, Segments, shortPercent, trialLabel,
} from "./AnalyticsChart.jsx";

const MU_COLORS = { 1: "var(--info)", 0.8: "#62cbd3", 0.6: "#b9a6f8" };
const OUTCOME_COLORS = { lap: "var(--good)", off_track: "var(--bad)", stalled: "var(--warn)", timeout: "#b9a6f8" };
const DASHES = [undefined, "7 3", "3 3", "7 3 2 3"];
const secondaryColor = "var(--text)";
const muColor = (mu) => MU_COLORS[mu] ?? "var(--muted)";
export const muValues = (rows) => [...new Set(rows.map(({ mu_factor }) => mu_factor))].sort((first, second) => second - first);

export function V2Laps({ entries, mus }) {
  const agents = entries.filter(({ condition }) => !isReference(condition)).sort((first, second) => second.laps - first.laps);
  const max = Math.max(...agents.map(({ attempts }) => attempts));
  const ticks = [...new Set([0, ...agents.map(({ attempts }) => attempts)])].sort((first, second) => first - second);
  const title = "Qui boucle le plus de tours ?";
  if (!agents.length) return null;
  return <ChartPanel title={title}
    guide="Chaque couleur compte les tours bouclés à une adhérence. Le total indique les tours réussis sur les essais réellement effectués. En dessous, chaque point montre le total d’une graine sur la même échelle ; des points éloignés signalent des résultats différents d’un entraînement à l’autre."
    legend={[...mus.map((mu) => ({ label: muTick(mu), color: muColor(mu) })), { label: "Une graine", color: secondaryColor, mark: "dot" }]}
    table={{ columns: ["Agent", ...mus.map(muTick), "Total", "Graines", "Résultats par graine"], rows: agents.map((entry) => [
      conditionLabel(entry.condition), ...mus.map((mu) => entry.byMu.has(mu) ? countLabel(entry.byMu.get(mu)) : "—"),
      countLabel(entry), entry.seeds.length, entry.seeds.map((seed) => `${trialLabel(seed.seed)} : ${countLabel(seed)}`).join(" · "),
    ]) }}>
    <HorizontalPlot title={title} unit="Tours bouclés" max={max} ticks={ticks}>
      {agents.map((entry) => <PlotRow key={entry.condition} condition={entry.condition} height={24 + entry.seeds.length * 9}
          report={<><strong>{countLabel(entry)}</strong><small>{seedCount(entry.seeds.length)}</small></>}>
        <Segments max={max} emptyTip={`${conditionLabel(entry.condition)} · Total : ${countLabel(entry)}`}
          segments={mus.flatMap((mu) => {
            const result = entry.byMu.get(mu);
            return result ? [{ value: result.laps, color: muColor(mu), tip: `${conditionLabel(entry.condition)} · ${muTick(mu)} : ${countLabel(result)}` }] : [];
          })} />
        {entry.seeds.map((seed, index) => <circle key={seed.seed} cx={position(seed.laps, max)} cy={26 + index * 9} r="4" fill={secondaryColor}>
          <title>{`${conditionLabel(entry.condition)} · ${trialLabel(seed.seed)} : ${countLabel(seed)} tours bouclés`}</title>
        </circle>)}
      </PlotRow>)}
    </HorizontalPlot>
  </ChartPanel>;
}

export function V2Heatmap({ rows, entries, mus, trackName }) {
  const seeds = [...new Set(entries.filter(({ condition }) => !isReference(condition)).flatMap((entry) => entry.seeds.map(({ seed }) => seed)))].sort();
  const [chosenSeed, setSeed] = useState(null);
  const seed = seeds.find((value) => String(value) === chosenSeed) ?? seeds[0];
  const tracks = [...new Set(rows.map(({ track_id }) => track_id))].sort((first, second) => trackName(first).localeCompare(trackName(second), "fr"));
  const matrix = summarizeCircuits(rows.filter((row) => isReference(row.condition) || trialSeed(row) === seed));
  const title = "Sur quels circuits les agents réussissent-ils ?";
  const columns = tracks.map(trackName);
  const heatColor = (count) => `color-mix(in srgb, var(--good) ${count / mus.length * 44}%, var(--panel-3))`;
  const cellTip = (id, track, cell) => `${conditionLabel(id)} · ${trackName(track)} · ${cell ? `${countLabel(cell)} tours bouclés` : "aucun essai"}`;
  return <ChartPanel title={title}
    guide="Une case indique combien de tours ont été bouclés sur ce circuit, en additionnant les niveaux d’adhérence pour la graine choisie. Plus le vert est marqué, plus il y a de réussites. Les pilotes programmés ne changent pas de graine."
    legend={[...Array.from({ length: mus.length + 1 }, (_, count) => ({ label: `${count} / ${mus.length}`, color: heatColor(count) })), { label: "— : aucun essai", color: "transparent" }]}
    table={{ columns: ["Agent ou référence", ...columns], rows: entries.map(({ condition }) => [conditionLabel(condition),
      ...tracks.map((track) => {
        const cell = matrix.get(condition)?.get(track);
        return cell ? countLabel(cell) : "—";
      }),
    ]) }}>
    {seeds.length > 0 && <label className="field analytics-select">Entraînement affiché par agent
      <select value={String(seed)} onChange={(event) => setSeed(event.target.value)}>
        {seeds.map((value) => <option key={value} value={String(value)}>{trialLabel(value)}</option>)}
      </select>
    </label>}
    <div className="analytics-scroll" role="region" tabIndex={0} aria-label="Carte de chaleur des circuits">
      <table className="analytics-heatmap">
        <thead><tr><th scope="col">Agent ou référence</th>{tracks.map((track) => <th key={track} scope="col">{trackName(track)}</th>)}</tr></thead>
        <tbody>{entries.map(({ condition }) => <tr key={condition}>
          <th scope="row"><Condition id={condition} short /></th>
          {tracks.map((track) => {
            const cell = matrix.get(condition)?.get(track);
            return <td key={track} title={cellTip(condition, track, cell)}>
              <svg width="100%" height="25" aria-hidden="true">
                <rect width="100%" height="100%" rx="4" fill={cell ? heatColor(cell.laps) : "transparent"} />
              </svg>
              <span>{cell?.laps ?? "—"}</span>
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
  </ChartPanel>;
}

export function V2Outcomes({ entries }) {
  const title = "Comment se terminent les essais ?";
  return <ChartPanel title={title}
    guide="Chaque barre représente tous les essais d’un pilote. La part verte correspond aux tours bouclés ; les autres couleurs distinguent une sortie de piste, un arrêt faute de progrès et la fin du temps autorisé. La part dépend du nombre d’essais, indiqué à droite."
    legend={OUTCOMES.map((key) => ({ label: OUTCOME_LABELS[key], color: OUTCOME_COLORS[key] }))}
    table={{ columns: ["Agent ou référence", ...OUTCOMES.map((key) => OUTCOME_LABELS[key]), "Essais"], rows: entries.map((entry) => [
      conditionLabel(entry.condition), ...OUTCOMES.map((key) => `${entry.outcomes[key]} (${formatPercent(entry.outcomes[key] / entry.attempts)})`), entry.attempts,
    ]) }}>
    <HorizontalPlot title={title} unit="Part des essais" max={1} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormat={shortPercent}>
      {entries.map((entry) => <PlotRow key={entry.condition} condition={entry.condition} report={`${entry.attempts} essais`}>
        <Segments max={1} segments={OUTCOMES.map((key) => ({ value: entry.outcomes[key] / entry.attempts, color: OUTCOME_COLORS[key],
          tip: `${conditionLabel(entry.condition)} · ${OUTCOME_LABELS[key]} : ${entry.outcomes[key]} / ${entry.attempts} (${formatPercent(entry.outcomes[key] / entry.attempts)})`,
        }))} />
      </PlotRow>)}
    </HorizontalPlot>
  </ChartPanel>;
}

export function LapTimes({ rows, entries, trackName, reference = "classic" }) {
  const ratios = summarizeLapRatios(rows, reference);
  const ranked = entries.filter(({ condition }) => ratios.has(condition))
    .sort((first, second) => ratios.get(first.condition).median - ratios.get(second.condition).median);
  const values = [...ratios.values()].flatMap(({ points }) => points.map(({ ratio }) => ratio));
  const min = Math.max(0, Math.floor(Math.min(1, ...values) * 2) / 2);
  const max = Math.max(1.5, Math.ceil(Math.max(1, ...values) * 2) / 2);
  const ticks = [...new Set([min, 1, ...[2, 3, 4].filter((tick) => tick < max), max])];
  const baseline = reference === "classic" ? "pilote classique" : "pilote suivant la trajectoire idéale";
  const title = `Qui roule le plus vite ? Temps relatif au ${baseline}`;
  const pointTip = (point) => `${trackName(point.track_id)} · ${muTick(point.mu_factor)} · ${isReference(point.condition) ? "Pilote programmé" : trialLabel(trialSeed(point))} · Épisode ${point.episode} · ${formatNumber(point.lap_time)} s / ${formatNumber(point.referenceTime)} s = ${formatNumber(point.ratio)}`;
  return <ChartPanel title={title}
    guide={`Chaque point est un tour terminé, comparé au ${baseline} sur le même circuit et à la même adhérence. À 1,0 le temps est identique ; plus à gauche, le tour est plus rapide. Le trait épais marque la médiane : la valeur du milieu quand on trie les résultats.`}
    legend={[{ label: "Un tour comparable (couleur du pilote)", color: "var(--info)", mark: "dot" }, { label: "Médiane", color: secondaryColor, mark: "line" },
      { label: "Temps de référence (1,0)", color: "var(--muted)", mark: "dash" }]}
    table={{ columns: ["Agent ou référence", "Circuit", "Adhérence", "Graine", "Épisode", "Temps (s)", "Référence (s)", "Rapport", "Médiane"],
      rows: ranked.flatMap(({ condition }) => {
        const { points, median } = ratios.get(condition);
        return points.map((point) => [conditionLabel(condition), trackName(point.track_id), muTick(point.mu_factor),
          isReference(condition) ? "—" : point.seed, point.episode, formatNumber(point.lap_time), formatNumber(point.referenceTime), formatNumber(point.ratio), formatNumber(median)]);
      }) }}>
    <p className="note">Un pilote sans tour comparable n’apparaît pas. Les échecs ne reçoivent pas de temps au tour.</p>
    {ranked.length ? <HorizontalPlot title={title} unit="Rapport des temps" min={min} max={max} ticks={ticks}
      tickFormat={(tick) => tick === 1 ? "1,0" : axisNumber(tick)}>
      {ranked.map(({ condition }) => {
        const { points, median } = ratios.get(condition);
        const middle = position(median, max, min);
        const equal = position(1, max, min);
        return <PlotRow key={condition} condition={condition} height={34} report={`Méd. ${axisNumber(median)}`}>
          <line x1={equal} x2={equal} y1="0" y2="34" stroke="var(--muted)" strokeDasharray="3 3" />
          {points.map((point, index) => <circle key={index} cx={position(point.ratio, max, min)} cy={7 + index % 5 * 5} r="4" fill={conditionColor(condition)}>
            <title>{`${conditionLabel(condition)} · ${pointTip(point)}`}</title>
          </circle>)}
          <line x1={middle} x2={middle} y1="2" y2="32" stroke={secondaryColor} strokeWidth="2">
            <title>{`${conditionLabel(condition)} · Médiane : ${formatNumber(median)} (${points.length} tours)`}</title>
          </line>
        </PlotRow>;
      })}
    </HorizontalPlot> : <p className="empty">Aucun tour comparable à la référence.</p>}
  </ChartPanel>;
}

export function Robustness({ entries, mus }) {
  const [hidden, setHidden] = useState([]);
  const chartId = useId();
  const title = "Les agents tiennent-ils quand la piste glisse ?";
  const selected = entries.filter(({ condition }) => !hidden.includes(condition));
  const series = entries.flatMap(({ condition, byMu }, index) => hidden.includes(condition) ? [] : [{
    name: conditionLabel(condition), color: conditionColor(condition), dash: DASHES[index % DASHES.length],
    points: mus.flatMap((mu, x) => byMu.has(mu) ? [{ x, y: byMu.get(mu).rate }] : []),
  }]);
  return <ChartPanel title={title}
    guide="De gauche à droite, la piste devient plus glissante. Une ligne qui reste haute indique que le pilote continue à boucler des tours. Chaque point indique la part des essais réussis ; les deux pilotes programmés connaissent l’adhérence. Décochez des pilotes pour isoler les courbes qui se superposent."
    table={{ columns: ["Agent ou référence", ...mus.map(muTick)], rows: selected.map(({ condition, byMu }) => [
      conditionLabel(condition), ...mus.map((mu) => rateLabel(byMu.get(mu))),
    ]) }}>
    <fieldset className="analytics-series-key" aria-controls={chartId}>
      <legend>Légende et courbes affichées</legend>
      {entries.map(({ condition }, index) => <label key={condition} title={conditionLabel(condition)}>
        <input type="checkbox" checked={!hidden.includes(condition)} onChange={() => setHidden((current) => current.includes(condition)
          ? current.filter((item) => item !== condition) : [...current, condition])} />
        <svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" stroke={conditionColor(condition)}
          strokeWidth="3" strokeDasharray={DASHES[index % DASHES.length]} /></svg>
        {conditionShort(condition)}
      </label>)}
    </fieldset>
    <div id={chartId} className="analytics-line-wide">
      {series.length ? <LineChart label="Taux de tours bouclés" xLabel="Adhérence" xTicks={mus.map((_, index) => index)}
        xFormat={(index) => muTick(mus[index])} yDomain={[0, 1]} yFormat={formatPercent} series={series} width={600} height={220} />
        : <p className="empty">Cochez un pilote pour afficher sa courbe.</p>}
    </div>
  </ChartPanel>;
}

export function V2Showcase({ rows }) {
  const groups = summarizeShowcase(rows);
  const train = new Map(groups.get("train").map((entry) => [entry.condition, entry]));
  const demo = new Map(groups.get("demo").map((entry) => [entry.condition, entry]));
  const conditions = [...new Set([...train.keys(), ...demo.keys()])];
  const max = Math.max(...[...train.values(), ...demo.values()].map(({ attempts }) => attempts));
  const title = "Démonstration : pistes connues ou pistes générées ?";
  if (!conditions.length) return <p className="card empty">Aucun résultat de démonstration disponible.</p>;
  const sets = [
    { label: "Circuits réels d’entraînement", color: "var(--info)", entries: train },
    { label: "Circuits générés à l’échelle F1", color: "#62cbd3", entries: demo },
  ];
  return <ChartPanel title={title}
    guide="Les deux barres comptent les tours bouclés sur deux groupes de circuits. Comparez aussi les fractions à droite : les groupes n’ont pas forcément le même nombre d’essais. Cette démonstration ne garde que la meilleure graine de chaque agent ; ce n’est pas son résultat moyen."
    legend={sets} table={{ columns: ["Agent ou référence", ...sets.map(({ label }) => label), "Graine retenue"], rows: conditions.map((id) => [
      conditionLabel(id), ...sets.map(({ entries }) => entries.has(id) ? countLabel(entries.get(id)) : "—"),
      isReference(id) ? "—" : (train.get(id) ?? demo.get(id)).seeds.map(({ seed }) => trialLabel(seed)).join(", "),
    ]) }}>
    <p className="note">Adhérence mesurée : {muValues(rows).map(muTick).join(" · ")}</p>
    <HorizontalPlot title={title} unit="Tours bouclés" max={max} ticks={[...new Set([0, ...[...train.values(), ...demo.values()]
      .map(({ attempts }) => attempts)])].sort((first, second) => first - second)}>
      {conditions.map((id) => <PlotRow key={id} condition={id} height={34} report={<>{sets.map(({ entries, label }) =>
        <small key={label}>{entries.has(id) ? countLabel(entries.get(id)) : "—"}</small>)}</>}>
        {sets.map(({ label, color, entries }, index) => {
          const entry = entries.get(id);
          const tip = `${conditionLabel(id)} · ${label} : ${entry ? countLabel(entry) : "aucun essai"}`;
          return <Segments key={label} max={max} y={4 + index * 15} height={11} emptyTip={tip}
            segments={entry ? [{ value: entry.laps, color, tip }] : []} />;
        })}
      </PlotRow>)}
    </HorizontalPlot>
  </ChartPanel>;
}

export function V1Laps({ entries, mus, mu, setMu }) {
  const ranked = entries.filter((entry) => entry.mu === mu).sort((first, second) => second.rate - first.rate);
  const title = "Tours bouclés sur les circuits générés de test";
  return <ChartPanel title={title}
    guide="Une barre longue indique que le pilote boucle souvent son tour. Le taux donne le même poids à chaque graine. Le trait blanc va du taux de la graine la moins performante au taux de la meilleure."
    legend={[{ label: "Taux moyen (couleur du pilote)", color: "var(--info)" }, { label: "Écart entre graines", mark: "line", color: secondaryColor }]}
    table={{ columns: ["Agent ou référence", "Taux moyen", "Minimum", "Maximum", "Graines", "Tours / essais"], rows: ranked.map((entry) => [
      conditionLabel(entry.condition), formatPercent(entry.rate), formatPercent(entry.min), formatPercent(entry.max), entry.seeds,
      countLabel({ laps: entry.laps, attempts: entry.episodes }),
    ]) }}>
    <MuPicker values={mus} value={mu} onChange={setMu} />
    {ranked.length ? <HorizontalPlot title={title} unit="Taux moyen" max={1} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormat={shortPercent}>
      {ranked.map((entry) => {
        const tip = `${conditionLabel(entry.condition)} · ${formatPercent(entry.rate)} · ${entry.laps} / ${entry.episodes} tours · ${seedCount(entry.seeds)}`;
        const left = position(entry.min, 1);
        const right = position(entry.max, 1);
        return <PlotRow key={entry.condition} condition={entry.condition} report={shortPercent(entry.rate)} height={30}>
          <Segments max={1} emptyTip={tip} segments={[{ value: entry.rate, color: conditionColor(entry.condition), tip }]} />
          {entry.seeds > 1 && <g stroke={secondaryColor}>
            <title>{`De ${formatPercent(entry.min)} à ${formatPercent(entry.max)} selon la graine`}</title>
            <line x1={left} x2={right} y1="25" y2="25" strokeWidth="2" />
            {[left, right].map((x, index) => <line key={index} x1={x} x2={x} y1="21" y2="29" />)}
          </g>}
        </PlotRow>;
      })}
    </HorizontalPlot> : <p className="empty">Aucun essai à cette adhérence.</p>}
  </ChartPanel>;
}
