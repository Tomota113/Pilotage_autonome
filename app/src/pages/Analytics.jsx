import { useEffect, useMemo, useState } from "react";
import LineChart, { formatNumber, formatPercent } from "../components/charts/LineChart.jsx";
import { identifyCondition } from "../components/charts/RunCondition.jsx";
import { CONDITIONS, conditionColor, conditionLabel, muLabel } from "../data/algorithms.js";
import { getMode, listRuns, listTracks, loadBestEval, loadEval, loadF1Eval, loadF1EvalV2, loadProgress } from "../data/api.js";
import { formatLapTimeGap, identifyF1Rows, lapTimeGap } from "../data/f1.js";

const MUS = [1, 0.8, 0.6];
const CONDITION_ORDER = new Map(CONDITIONS.map(({ id }, index) => [id, index]));
const DEFAULT_CONDITIONS = ["classic", "sac_mufixe", "ppo_mufixe", "ppo_mualea", "dqn_mufixe"];
const MAX_CONDITIONS = 5;
const MAX_SEEDS_PER_CHART = 6;
const SPLITS = { train: "Entraînement", test: "Test", demo: "Démonstration" };
const METRICS = { lap_rate: "Taux de tours bouclés", mean_reward: "Récompense moyenne" };
const MU_FORMAT = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1 });
const AXIS_NUMBER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const DISPLAY_PERCENT = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });
const DISPLAY_NUMBER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const COMPACT_STEPS = new Intl.NumberFormat("fr-FR", { notation: "compact" });

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const number = (value) => value === "" || value == null ? NaN : Number(value);
const muTick = (value) => `μ ${MU_FORMAT.format(value)}`;
const displayNumber = (value) => Number.isFinite(value) ? DISPLAY_NUMBER.format(value) : "—";

async function evaluation(checkpoint) {
  const [mode, rows] = await Promise.all([getMode(), checkpoint === "best" ? loadBestEval() : loadEval()]);
  const runs = new Map(rows.map((row) => [row.run_id, row]));
  const conditions = new Map(await Promise.all([...runs].map(async ([id, row]) => [id, await identifyCondition(row, mode)])));
  return rows.map((row) => ({ ...row, ...conditions.get(row.run_id) }));
}

async function learning() {
  const [mode, runs] = await Promise.all([getMode(), listRuns()]);
  const sources = await Promise.all(runs.filter(({ run_id }) => run_id.includes("multi")).map(async (run) => {
    const rows = await loadProgress(run.run_id);
    if (!rows.length) return null;
    const { run_id: runId } = run;
    const algo = runId.split("_")[0];
    const muMode = runId.includes("mualea") ? "uniform" : "fixed";
    const condition = await identifyCondition({ run_id: runId, algo, mu_mode: muMode }, mode);
    return { ...run, seed: run.seed ?? rows[0].seed, ...condition, rows };
  }));
  return sources.filter((source) => source?.condition);
}

export function aggregateEvaluation(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.condition || !row.split || !Number.isFinite(number(row.mu_factor)) || !row.outcome) continue;
    const mu = number(row.mu_factor);
    const key = JSON.stringify([row.condition, mu, row.split]);
    if (!groups.has(key)) groups.set(key, { key, condition: row.condition, mu, split: row.split, seeds: new Map() });
    const { seeds } = groups.get(key);
    const seed = row.seed ?? row.run_id;
    if (!seeds.has(seed)) seeds.set(seed, []);
    seeds.get(seed).push(row);
  }

  return [...groups.values()].map(({ seeds, ...entry }) => {
    const episodes = [...seeds.values()];
    const laps = episodes.map((rows) => rows.filter(({ outcome }) => outcome === "lap"));
    const rates = laps.map((rows, index) => rows.length / episodes[index].length);
    return {
      ...entry,
      rate: mean(rates),
      min: Math.min(...rates),
      max: Math.max(...rates),
      seeds: seeds.size,
      episodes: episodes.reduce((sum, rows) => sum + rows.length, 0),
      lapTime: mean(laps.map((rows) => mean(rows.map((row) => number(row.lap_time)).filter(Number.isFinite))).filter(Number.isFinite)),
      offtracks: mean(episodes.map((rows) => mean(rows.map((row) => number(row.offtracks)).filter(Number.isFinite))).filter(Number.isFinite)),
    };
  });
}

export function aggregateLearning(sources, metric) {
  return CONDITIONS.flatMap(({ id: condition }) => {
    const runs = new Map();
    for (const source of sources.filter((item) => item.condition === condition)) {
      const seed = source.seed ?? source.run_id;
      const points = new Map(source.rows.map((row) => [number(row.step), number(row[metric])])
        .filter((point) => point.every(Number.isFinite)));
      if (!points.size) continue;
      const current = runs.get(seed);
      if (!current || source.run_id > current.id) runs.set(seed, { id: source.run_id, points });
    }
    if (!runs.size) return [];
    const byStep = new Map();
    const seeds = [...runs].map(([seed, { points }]) => {
      const series = [...points].sort(([a], [b]) => a - b).map(([x, y]) => {
        if (!byStep.has(x)) byStep.set(x, []);
        byStep.get(x).push(y);
        return { x, y };
      });
      return { name: Number.isFinite(Number(seed)) ? `Graine ${formatNumber(Number(seed))}` : `Essai ${seed}`, points: series };
    });
    const average = [...byStep].filter(([, values]) => values.length === runs.size)
      .sort(([a], [b]) => a - b).map(([x, values]) => ({ x, y: mean(values) }));
    return [{ condition, seeds, average }];
  });
}

function StatTile({ label, entry, detail }) {
  return <div className="stat-tile">
    <div className="label">{label}</div>
    <div className="value">{entry ? DISPLAY_PERCENT.format(entry.rate) : "—"}</div>
    <div className="detail">{entry ? detail : "Aucun résultat disponible"}</div>
  </div>;
}

function Bars({ entries, descriptionId }) {
  return <div className="stack" role="list" aria-label="Taux de tours bouclés par condition" aria-describedby={descriptionId}>
    {entries.map((entry) => {
      const { condition, rate, min, max, seeds, episodes } = entry;
      const width = `${rate * 100}%`;
      const title = `${conditionLabel(condition)} · ${formatPercent(rate)} · ${formatNumber(episodes)} épisodes · ${formatNumber(seeds)} ${seeds === 1 ? "graine" : "graines"}`
        + (seeds > 1 ? ` · De ${formatPercent(min)} à ${formatPercent(max)} selon la graine` : "");
      return (
        <div key={condition} role="listitem" title={title}>
          <span className="swatch" style={{ background: conditionColor(condition) }} />
          {conditionLabel(condition)}
          <div style={{ paddingRight: "4.5rem", marginTop: 5, paddingBottom: seeds > 1 ? 11 : 0 }}>
            <div style={{ position: "relative", height: 11, borderRadius: 5, background: "var(--panel-3)" }}>
              <div style={{ width, height: "100%", borderRadius: 5, background: conditionColor(condition) }} />
              {seeds > 1 && (
                <svg viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true"
                     style={{ position: "absolute", inset: 0, width: "100%", height: 22, overflow: "visible" }}>
                  <path d={`M${min * 100} 15v6m0 -3H${max * 100}m0 -3v6`} stroke="var(--text)"
                        fill="none" vectorEffect="non-scaling-stroke" />
                </svg>
              )}
              <span style={{ position: "absolute", top: -4, left: `calc(${width} + 7px)`, whiteSpace: "nowrap", fontSize: 13 }}>
                {DISPLAY_PERCENT.format(rate)}
              </span>
            </div>
          </div>
        </div>
      );
    })}
  </div>;
}

function F1Results() {
  const [result, setResult] = useState(null);
  const [preference, setSeries] = useState(null);
  const [mu, setMu] = useState(1);

  useEffect(() => {
    let active = true;
    async function load() {
      const sources = await Promise.allSettled([loadF1Eval(), loadF1EvalV2()]);
      const [runs, tracks] = sources.some(({ value }) => value?.length)
        ? await Promise.all([listRuns(), listTracks()]) : [[], []];
      const [v1, v2] = sources.map(({ status, value }) => status === "rejected"
        ? { error: true } : { rows: value === null ? null : identifyF1Rows(value, runs) });
      return { v1, v2, tracks };
    }
    load().then((data) => { if (active) setResult(data); })
      .catch(() => { if (active) setResult({ error: true }); });
    return () => { active = false; };
  }, []);

  const series = preference ?? (result?.v2?.rows != null ? "v2" : "v1");
  const current = result?.[series];
  const rows = current?.rows ?? [];
  const conditions = [...new Set(rows.map(({ condition }) => condition).filter(Boolean))];
  conditions.sort((a, b) => (CONDITION_ORDER.get(a) ?? CONDITIONS.length) - (CONDITION_ORDER.get(b) ?? CONDITIONS.length)
    || conditionLabel(a).localeCompare(conditionLabel(b), "fr"));
  const names = new Map((result?.tracks ?? []).map(({ id, name }) => [id, name]));
  const trackIds = [...new Set(rows.map(({ track_id }) => track_id))]
    .sort((a, b) => (names.get(a) ?? a).localeCompare(names.get(b) ?? b, "fr"));
  const selected = rows.filter((row) => Number(row.mu_factor) === mu);
  const bars = aggregateEvaluation(selected).sort((a, b) => b.rate - a.rate || conditions.indexOf(a.condition) - conditions.indexOf(b.condition));

  return <section className="card" aria-labelledby="f1-title">
    <h3 className="card-title" id="f1-title">Circuits de F1 réels</h3>
    <div className="controls">
      <label className="field" style={{ maxWidth: "100%" }}>Série
        <select value={series} onChange={(event) => setSeries(event.target.value)} disabled={!result}>
          <option value="v2">Nouvelle série : voiture F1, entraînée sur circuits réels (eval_f1_v2.csv)</option>
          <option value="v1">Première série : modèle simplifié (eval_f1.csv)</option>
        </select>
      </label>
    </div>
    {!result ? <p role="status">Chargement de l’évaluation F1…</p>
      : result.error || current?.error ? <p className="warn" role="alert">Impossible de charger cette série d’évaluations F1.</p>
      : !rows.length ? <p className="empty">Aucun résultat disponible pour cette série.</p>
      : <>
        <p className="note">{series === "v2"
          ? "Les agents de cette série ont appris sur 17 circuits réels."
          : "Les agents de cette série découvrent les circuits de F1 pendant l’évaluation."} Le pilote trajectoire idéale sert de référence.</p>
        <div className="controls">
          <div className="segmented" role="group" aria-label="Adhérence sur les circuits de F1">
            {MUS.map((value) => <button key={value} type="button" title={muLabel(value)}
              className={mu === value ? "on" : ""} aria-pressed={mu === value} onClick={() => setMu(value)}>{muTick(value)}</button>)}
          </div>
          <span className="note">{muLabel(mu).split(" (")[0]}</span>
        </div>
        <p className="note">Temps moyens des tours bouclés. Un écart positif indique un tour plus lent que celui du pilote idéal.</p>
        <div className="f1-table" role="region" aria-label="Temps au tour sur les circuits de F1" tabIndex={0}>
          <table>
            <thead><tr>
              <th scope="col">Circuit</th>
              {conditions.map((id) => <th scope="col" key={id} className="num">{conditionLabel(id)}</th>)}
            </tr></thead>
            <tbody>{trackIds.map((id) => {
              const laps = new Map(aggregateEvaluation(selected.filter((row) => row.track_id === id))
                .map(({ condition, lapTime }) => [condition, lapTime]));
              return <tr key={id}>
                <th scope="row">{names.get(id) ?? id}</th>
                {conditions.map((condition) => {
                  const time = laps.get(condition);
                  const gap = lapTimeGap(time, laps.get("raceline"));
                  const tone = gap > 0 ? "bad" : gap < 0 ? "good" : "";
                  return <td key={condition} className="num">
                    {time > 0 ? <>{displayNumber(time)} s <span className={`chip ${tone}`}>{gap == null ? "—" : formatLapTimeGap(gap)}</span></> : "—"}
                  </td>;
                })}
              </tr>;
            })}</tbody>
          </table>
        </div>
        <h4 className="card-title" style={{ marginTop: 20 }}>Tours bouclés sur les circuits de cette série</h4>
        <p className="note" id="f1-bars-guide">Part des essais où chaque agent boucle un tour, à l’adhérence choisie. Chaque graine compte autant.</p>
        {bars.length ? <Bars entries={bars} descriptionId="f1-bars-guide" /> : <p className="empty">Aucun résultat à cette adhérence.</p>}
      </>}
  </section>;
}

function Robustness({ entries, wanted, setWanted }) {
  const available = CONDITIONS.filter(({ id }) => entries.some((entry) => entry.condition === id && MUS.includes(entry.mu)));
  const selected = available.filter(({ id }) => wanted.includes(id));
  const dashes = [undefined, "8 3", "3 3", "8 3 2 3", "2 3 6 3"];
  const series = selected.map(({ id, label }, index) => ({
    name: label, color: conditionColor(id), dash: dashes[index],
    points: MUS.flatMap((mu, x) => {
      const entry = entries.find((row) => row.mu === mu && row.condition === id);
      return entry ? [{ x, y: entry.rate }] : [];
    }),
  }));
  return <section className="card" aria-labelledby="robustness-title">
    <h3 className="card-title" id="robustness-title">Robustesse · tours bouclés selon l’adhérence</h3>
    <p id="robustness-guide" className="note"><strong>Comment lire ce graphique.</strong> De gauche à droite, la piste devient plus glissante.
      Une ligne qui reste haute indique que l’agent continue à boucler des tours sur les circuits de test.</p>
    {available.length > 0 && <fieldset style={{ border: "1px solid var(--line)", borderRadius: 8 }}>
      <legend>Conditions à comparer (jusqu’à {MAX_CONDITIONS})</legend>
      <div className="controls" style={{ columnGap: 16 }}>
        {available.map(({ id, label }) => {
          const checked = wanted.includes(id);
          const index = selected.findIndex((item) => item.id === id);
          return <label key={id} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            <input type="checkbox" checked={checked} disabled={!checked && selected.length >= MAX_CONDITIONS}
                   onChange={() => setWanted((current) => checked ? current.filter((item) => item !== id) : [...current, id])} />
            <svg width="24" height="10" aria-hidden="true">
              <line x1="1" x2="23" y1="5" y2="5" stroke={conditionColor(id)} strokeWidth="3" strokeDasharray={dashes[index]} />
            </svg>
            {label}
          </label>;
        })}
      </div>
    </fieldset>}
    {series.length ? <div style={{ maxWidth: 690 }}>
      <LineChart label="Tours bouclés" xLabel="Adhérence" xTicks={[0, 1, 2]} xFormat={(i) => muTick(MUS[i])}
                 yDomain={[0, 1]} yFormat={formatPercent} series={series} descriptionId="robustness-guide" width={520} height={205} />
    </div> : <p className="empty">{available.length ? "Cochez une condition pour afficher sa courbe." : "Aucun résultat de test à comparer."}</p>}
  </section>;
}

function Learning({ sources, metric, setMetric, error }) {
  const series = useMemo(() => aggregateLearning(sources ?? [], metric), [sources, metric]);
  const points = series.flatMap(({ seeds }) => seeds.flatMap((seed) => seed.points));
  const maxStep = Math.max(0, ...points.map(({ x }) => x));
  const xTicks = [...new Set([0, Math.round(maxStep / 2), maxStep])];
  const rewards = points.map(({ y }) => y);
  const low = Math.min(...rewards);
  const high = Math.max(...rewards);
  const pad = (high - low || Math.abs(high) || 1) * 0.08;
  const yDomain = metric === "lap_rate" ? [0, 1] : [low - pad, high + pad];
  return <section className="card" aria-labelledby="learning-title">
    <h3 className="card-title" id="learning-title">Courbes d’apprentissage</h3>
    <label className="field" style={{ width: "fit-content", maxWidth: "100%" }}>Mesure affichée
      <select value={metric} onChange={(event) => setMetric(event.target.value)}>
        {Object.entries(METRICS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
    </label>
    <p className="note" id="learning-guide"><strong>Comment lire ce graphique.</strong> Chaque trait fin suit une graine, c’est-à-dire un essai
      avec un hasard différent. Le trait épais donne la moyenne aux pas communs à toutes les graines.
      Les cartes utilisent la même échelle et les évaluations sont faites pendant l’entraînement.</p>
    {metric === "mean_reward" && <p className="note">La récompense est le score donné à l’agent. Elle tient compte de sa progression,
      du tour bouclé et des pénalités prévues pendant l’entraînement.</p>}
    {error ? <p className="warn" role="alert">{error}</p> : sources === null ? <p role="status">Chargement de la progression…</p>
      : !series.length ? <p className="empty">Aucune progression disponible pour les entraînements sur plusieurs circuits.</p>
      : <div className="grid-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 310px), 1fr))" }}>
        {series.map(({ condition, seeds, average }) => {
          const color = conditionColor(condition);
          const yFormat = metric === "lap_rate" ? formatPercent : (value) => AXIS_NUMBER.format(value);
          const exact = metric === "lap_rate" ? formatPercent : formatNumber;
          const seedGroups = Array.from({ length: Math.ceil(seeds.length / MAX_SEEDS_PER_CHART) }, (_, index) =>
            seeds.slice(index * MAX_SEEDS_PER_CHART, (index + 1) * MAX_SEEDS_PER_CHART));
          return <article className="card" key={condition} style={{ background: "var(--panel-2)" }}>
            <h4 className="card-title" style={{ marginBottom: 0 }}>
              <span className="swatch" style={{ background: color }} />{conditionLabel(condition)}
            </h4>
            <p className="note" style={{ margin: "2px 0 4px" }}>
              {formatNumber(seeds.length)} {seeds.length === 1 ? "graine" : "graines"} · {METRICS[metric]}
            </p>
            {seedGroups.map((group) => (
              <div key={group[0].name}>
                {seedGroups.length > 1 && <p className="note">{group.map(({ name }) => name).join(", ")}</p>}
                <LineChart label={METRICS[metric]} xLabel="Pas d’entraînement" xTicks={xTicks} descriptionId="learning-guide"
                           xFormat={(value) => COMPACT_STEPS.format(value)} yDomain={yDomain} yFormat={yFormat}
                           tooltipXFormat={(value) => `${formatNumber(value)} pas`} tooltipYFormat={exact}
                           series={[
                             ...group.map((seed) => ({ ...seed, color, opacity: 0.55, strokeWidth: 1 })),
                             { name: "Moyenne", points: average, color, strokeWidth: 3 },
                           ]} />
              </div>
            ))}
          </article>;
        })}
      </div>}
    {sources?.some(({ uncertain }) => uncertain) && <p className="note">Certaines configurations PPO fixes sont indisponibles.
      Leur classement suit les informations du nom de l’entraînement.</p>}
  </section>;
}

function EvaluationDetails({ entries }) {
  const order = CONDITIONS.map(({ id }) => id);
  return <details className="card">
    <summary style={{ cursor: "pointer", fontWeight: 650 }}>Résultats détaillés par condition, adhérence et groupe de circuits</summary>
    <p className="note">Chaque graine compte autant. Le temps moyen porte sur les tours bouclés.</p>
    <div style={{ overflowX: "auto" }} role="region" aria-label="Tableau des évaluations" tabIndex={0}>
      <table>
        <thead><tr>
          <th scope="col">Condition</th><th scope="col">Adhérence</th><th scope="col">Circuits</th>
          <th scope="col" className="num">Tours bouclés</th><th scope="col" className="num">Temps moyen (s)</th>
          <th scope="col" className="num">Sorties de piste par essai</th>
          <th scope="col" className="num">Essais</th>
        </tr></thead>
        <tbody>{[...entries].sort((a, b) => order.indexOf(a.condition) - order.indexOf(b.condition)
          || b.mu - a.mu || a.split.localeCompare(b.split)).map((entry) => (
          <tr key={entry.key}>
            <th scope="row"><span className="swatch" style={{ background: conditionColor(entry.condition) }} />
              {conditionLabel(entry.condition)}</th>
            <td>{muTick(entry.mu)}</td><td>{SPLITS[entry.split] ?? entry.split}</td>
            <td className="num" title={formatPercent(entry.rate)}>{DISPLAY_PERCENT.format(entry.rate)}</td>
            <td className="num" title={formatNumber(entry.lapTime)}>{displayNumber(entry.lapTime)}</td>
            <td className="num" title={formatNumber(entry.offtracks)}>{displayNumber(entry.offtracks)}</td>
            <td className="num">{formatNumber(entry.episodes)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  </details>;
}

function Takeaways({ test, checkpoint, mode }) {
  const find = (id, mu) => test.find((entry) => entry.condition === id && entry.mu === mu);
  const ppoFixed = find("ppo_mufixe", 0.6);
  const ppoVariable = find("ppo_mualea", 0.6);
  const classicNormal = find("classic", 1);
  const classicSlippery = find("classic", 0.6);
  const wider = [...test].filter(({ seeds }) => seeds > 1).sort((a, b) => (b.max - b.min) - (a.max - a.min))[0];
  return <section className="card">
    <h3 className="card-title">Ce qu’il faut retenir</h3>
    <ul style={{ marginBottom: 0 }}>
      <li>{ppoFixed && ppoVariable
        ? `Sur piste glissante, PPO entraîné à adhérence variable boucle ${DISPLAY_PERCENT.format(ppoVariable.rate)} des tours de test,
          contre ${DISPLAY_PERCENT.format(ppoFixed.rate)} pour PPO entraîné à adhérence fixe.`
        : "Le changement d’adhérence permet de voir si un agent sait encore piloter quand les conditions changent."}</li>
      <li>{classicNormal?.lapTime != null && classicSlippery?.lapTime != null
        ? `Le pilote classique connaît le circuit et l’adhérence. Son temps moyen passe de
          ${displayNumber(classicNormal.lapTime)} s à adhérence normale à ${displayNumber(classicSlippery.lapTime)} s sur piste glissante.`
        : "Le pilote classique connaît le circuit et l’adhérence. Il sert de référence pour la comparaison."}</li>
      <li>{wider && wider.max > wider.min
        ? `Le plus grand écart observé entre graines va de ${DISPLAY_PERCENT.format(wider.min)} à ${DISPLAY_PERCENT.format(wider.max)}
          de tours bouclés pour ${conditionLabel(wider.condition)} (${muTick(wider.mu)}).`
        : "Quand plusieurs graines sont disponibles, les moustaches montrent l’écart entre les essais."}</li>
      <li>{checkpoint === "best"
        ? "Le meilleur point de sauvegarde est choisi sur les circuits d’entraînement. Les circuits de test servent ensuite à la comparaison."
        : "Le dernier point de sauvegarde correspond à la fin de l’apprentissage. Un agent peut avoir été plus performant plus tôt."}</li>
      <li>{mode === "fixtures" ? "Les résultats d’exemple servent à lire l’interface." :
        "Le protocole utilise trois graines par condition apprise. Les résultats varient parfois fortement entre graines, ce qui invite à rester prudent sur les petits écarts."}</li>
    </ul>
  </section>;
}

export default function Analytics({ mode }) {
  const [checkpoint, setCheckpoint] = useState("best");
  const [mu, setMu] = useState(1);
  const [wanted, setWanted] = useState(DEFAULT_CONDITIONS);
  const [metric, setMetric] = useState("lap_rate");
  const [result, setResult] = useState(null);
  const [sources, setSources] = useState(null);
  const [learningError, setLearningError] = useState("");

  useEffect(() => {
    let active = true;
    evaluation(checkpoint).then((rows) => {
      if (active) setResult({ checkpoint, rows });
    }).catch(() => {
      if (active) setResult({ checkpoint, error: "Impossible de charger les résultats d’évaluation." });
    });
    return () => { active = false; };
  }, [checkpoint]);

  useEffect(() => {
    let active = true;
    learning().then((rows) => { if (active) setSources(rows); })
      .catch(() => { if (active) setLearningError("Impossible de charger la progression des entraînements."); });
    return () => { active = false; };
  }, []);

  const current = result?.checkpoint === checkpoint ? result : null;
  const entries = useMemo(() => aggregateEvaluation(current?.rows ?? []), [current]);
  const test = entries.filter(({ split }) => split === "test");
  const ranking = (mu) => test.filter((entry) => entry.mu === mu)
    .sort((a, b) => b.rate - a.rate || conditionLabel(a.condition).localeCompare(conditionLabel(b.condition), "fr"));
  const bestLearned = (mu) => {
    const ranked = ranking(mu).filter(({ condition }) => condition !== "classic");
    const leader = ranked[0];
    return { leader, detail: ranked.filter((entry) => entry.rate === leader?.rate).map(({ condition }) => conditionLabel(condition)).join(", ") };
  };
  const normal = bestLearned(1);
  const slippery = bestLearned(0.6);
  const classic = test.find(({ condition, mu }) => condition === "classic" && mu === 1);
  const bars = ranking(mu);

  return <div className="stack" style={{ minWidth: 0 }}>
    <header className="page-header" style={{ marginBottom: 0 }}>
      <h2>Résultats des expériences</h2>
      <p>Comparez les agents sur des circuits qu’ils n’ont pas utilisés pour apprendre et voyez comment ils réagissent quand la piste glisse.</p>
    </header>
    <label className="field" style={{ width: "fit-content" }}>Checkpoint évalué
      <select value={checkpoint} onChange={(event) => { setResult(null); setCheckpoint(event.target.value); }}>
        <option value="best">Meilleur</option><option value="last">Dernier</option>
      </select>
    </label>
    {!current ? <p role="status">Chargement des résultats…</p> : current.error ? <p className="warn" role="alert">{current.error}</p>
      : !entries.length ? <p className="empty">Aucun résultat d’évaluation disponible.</p>
      : <>
        <div className="grid-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
          <StatTile label="En tête à adhérence normale" entry={normal.leader} detail={normal.detail} />
          <StatTile label="En tête sur piste glissante" entry={slippery.leader} detail={slippery.detail} />
          <StatTile label="Pilote classique à adhérence normale" entry={classic} detail="Référence sur les circuits de test" />
        </div>
        {checkpoint === "best" && <p className="note" style={{ margin: 0 }}>
          Un checkpoint est une sauvegarde de l’agent. Si les résultats du meilleur checkpoint sont indisponibles,
          le dernier est affiché.
        </p>}
        {current.rows.some(({ uncertain }) => uncertain) && <p className="note">Certaines configurations PPO fixes
          sont indisponibles. Leur classement suit les informations du nom de l’entraînement.</p>}
        <section className="card">
          <h3 className="card-title">Tours bouclés sur les circuits de test</h3>
          <div className="controls">
            <div className="segmented" role="group" aria-label="Adhérence de la piste">
              {MUS.map((value) => <button key={value} type="button" title={muLabel(value)}
                className={mu === value ? "on" : ""} aria-pressed={mu === value} onClick={() => setMu(value)}>{muTick(value)}</button>)}
            </div>
            <span className="note">{muLabel(mu).split(" (")[0]}</span>
          </div>
          <p className="note" id="bars-guide"><strong>Comment lire ce graphique.</strong> Plus la barre est longue, plus l’agent boucle de tours.
            Le trait blanc va du taux le plus bas au plus haut quand plusieurs graines sont disponibles.</p>
          {bars.length ? <Bars entries={bars} descriptionId="bars-guide" /> : <p className="empty">Aucun test à cette adhérence.</p>}
        </section>
      </>}
    <F1Results />
    {entries.length > 0 && <Robustness entries={test} wanted={wanted} setWanted={setWanted} />}
    <Learning sources={sources} metric={metric} setMetric={setMetric} error={learningError} />
    {entries.length > 0 && <>
      <EvaluationDetails entries={entries} />
      <Takeaways test={test} checkpoint={checkpoint} mode={mode} />
    </>}
  </div>;
}
