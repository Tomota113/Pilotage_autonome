import { useEffect, useMemo, useState } from "react";
import { aggregateEvaluation, evaluationRows, isF1Condition, isReference, summarizeTakeaways, summarizeTrials } from "../data/analytics.js";
import { conditionLabel, OUTCOME_LABELS } from "../data/algorithms.js";
import { getMode, listRuns, listTracks, loadAnalyticsEvalV1, loadF1EvalV2, loadProgress, loadShowcaseEvalV2 } from "../data/api.js";
import { identifyF1Rows } from "../data/f1.js";
import { countLabel, muTick, shortPercent, ChartTable } from "../components/charts/AnalyticsChart.jsx";
import { LapTimes, muValues, Robustness, V1Laps, V2Heatmap, V2Laps, V2Outcomes, V2Showcase } from "../components/charts/AnalyticsEvaluation.jsx";
import AnalyticsLearning from "../components/charts/AnalyticsLearning.jsx";
import { formatNumber, formatPercent } from "../components/charts/LineChart.jsx";

const SERIES = { v2: "Série v2 — F1 réaliste (principale)", v1: "Série v1 — modèle simplifié" };
const SPLITS = { train: "Entraînement", test: "Test", demo: "Démonstration" };
const EMPTY = [];

const GLOSSARY = {
  "Agent": "Pilote qui apprend à prendre des décisions à partir de ses essais, contrairement aux pilotes programmés qui servent de référence.",
  "Graine": "Valeur qui initialise le hasard de l’entraînement. Changer de graine donne un autre entraînement avec la même méthode ; le résultat peut changer.",
  "μ (mu)": "Facteur d’adhérence de la piste. Plus il est bas, moins la voiture peut freiner ou tourner fort sans glisser.",
  "Checkpoint": "Sauvegarde d’un agent en cours d’entraînement. Le meilleur est choisi à partir de mesures d’entraînement, avant la comparaison sur les circuits de test.",
  "Récompense": "Score donné par le simulateur. Avancer et finir un tour aident le score ; sortir de la piste le fait baisser. Ce n’est ni un temps au tour ni un nombre de tours.",
  "Épisode": "Un essai de conduite, du départ à la première fin : tour terminé, sortie, arrêt faute de progrès ou temps écoulé.",
  "Pas d’entraînement": "Une interaction de l’agent avec le simulateur. Plus il y a de pas, plus l’agent a eu d’occasions de pratiquer.",
  "Tour bouclé": "Un tour entier validé par le simulateur. Une voiture qui s’arrête juste avant l’arrivée n’a pas bouclé le tour.",
  "Robustesse": "Capacité à continuer à boucler des tours quand les conditions changent, par exemple quand l’adhérence baisse.",
  "Médiane": "Valeur centrale d’une liste triée, ou moyenne des deux valeurs centrales si la liste a une taille paire.",
  "PPO": "Apprend une règle de conduite et limite l’ampleur de chaque mise à jour de cette règle pour éviter de la changer trop brusquement.",
  "SAC": "Apprend à doser les commandes en cherchant à la fois des récompenses et une conduite qui continue d’explorer plusieurs actions.",
  "TD3": "Apprend des commandes continues et compare les estimations de deux évaluateurs pour limiter les estimations trop optimistes.",
  "TQC": "Variante de SAC qui estime plusieurs retours possibles et écarte les estimations les plus optimistes.",
  "DQN et QR-DQN": "DQN utilise un réseau pour noter des actions prédéfinies. QR-DQN estime plusieurs retours possibles pour chaque action plutôt qu’une seule valeur moyenne.",
  "Q-Learning": "Ici, remplit une table de scores par situation et action. Pour mettre à jour une case, il considère la meilleure action suivante d’après la table.",
  "SARSA": "Met à jour ses scores à partir de l’action suivante réellement choisie, y compris lorsqu’il explore.",
  "Monte-Carlo": "Attend la fin de l’épisode pour utiliser la somme des récompenses futures et réviser le score des actions prises.",
  "Tabulaire ou profond (« Deep »)": "Une méthode tabulaire mémorise les scores dans une table ; sa version profonde utilise un réseau de neurones pour les estimer.",
};

function Takeaways({ entries }) {
  const { leaders, lowestMu, agentsLow, referencesLow, tabular, failures } = summarizeTakeaways(entries);
  const leading = leaders.map(({ condition }) => conditionLabel(condition)).join(" et ");
  const seedCounts = entries.filter(({ condition }) => !isReference(condition)).map(({ seeds }) => seeds.length);
  return <section className="card analytics-takeaways">
    <h3 className="card-title">Ce qu’il faut retenir</h3>
    <ul>
      {leaders.length ? <li><strong>Meilleur taux observé.</strong> {leading}{leaders.length > 1 ? " (ex æquo)" : ""} : {shortPercent(leaders[0].rate)} de réussite
        ({leaders.map(countLabel).join(" et ")} essais réussis{leaders.length > 1 ? ", respectivement" : ""}).</li> : <li>Aucun agent appris n’est renseigné dans ces résultats.</li>}
      {agentsLow.attempts > 0 && <li><strong>Piste la plus glissante ({muTick(lowestMu)}).</strong> Les agents réussissent {countLabel(agentsLow)} essais
        {referencesLow.attempts > 0 ? `, contre ${countLabel(referencesLow)} pour les pilotes programmés` : ""}.</li>}
      {tabular.attempts > 0 && <li><strong>Méthodes à table.</strong> Q-Learning, SARSA et Monte-Carlo tabulaires réussissent ensemble {countLabel(tabular)} essais.</li>}
      {failures.length > 0 && <li><strong>Échec le plus fréquent{failures.length > 1 ? " (ex æquo)" : ""}.</strong> {failures.map(({ outcome, count }) =>
        `${OUTCOME_LABELS[outcome]} (${count} essais)`).join(" et ")} chez les agents appris.</li>}
      {seedCounts.length > 0 && <li><strong>À interpréter avec prudence.</strong> {Math.min(...seedCounts) === Math.max(...seedCounts)
        ? `Chaque méthode est représentée par ${seedCounts[0]} entraînement(s).`
        : `Selon la méthode, on dispose de ${Math.min(...seedCounts)} à ${Math.max(...seedCounts)} entraînements.`}</li>}
    </ul>
  </section>;
}

async function evaluationSource(request, runs, testOnly = false) {
  try {
    const identified = identifyF1Rows(await request ?? EMPTY, runs);
    const rows = evaluationRows(identified);
    return { rows: testOnly ? rows.filter(({ split }) => split === "test") : rows,
      unclassified: identified.filter((row) => !row.condition).length };
  } catch {
    return { error: true };
  }
}

function MissingEvaluation({ source, label }) {
  if (!source) return <p role="status">Chargement de {label}…</p>;
  if (source.error) return <p className="card warn" role="alert">Impossible de charger {label}.</p>;
  return <p className="card empty">Aucun résultat disponible pour {label}.</p>;
}

function V1Evaluation({ rows, entries, trackName, checkpoint }) {
  const [chosenMu, setMu] = useState(null);
  const tests = useMemo(() => rows.filter(({ split }) => split === "test"), [rows]);
  const mus = muValues(tests);
  const mu = mus.includes(chosenMu) ? chosenMu : mus[0];
  const detailed = useMemo(() => aggregateEvaluation(rows), [rows]);
  const test = detailed.filter(({ split }) => split === "test");
  const robustness = entries.map((entry) => ({ ...entry, byMu: new Map(test.filter((item) => item.condition === entry.condition)
    .map(({ mu, rate, laps, episodes }) => [mu, { rate, laps, attempts: episodes }])) }));
  return <>
    <p className="note">Résultats du {checkpoint === "best" ? "meilleur" : "dernier"} point de sauvegarde sur les circuits générés.
      Le test utilise des circuits différents de ceux de l’entraînement.</p>
    {tests.length ? <>
      <V1Laps entries={test} mus={mus} mu={mu} setMu={setMu} />
      <Robustness entries={robustness} mus={mus} />
      <LapTimes rows={tests.filter(({ mu_factor }) => mu_factor === mu)} entries={entries} trackName={trackName}
        reference={entries.some(({ condition }) => condition === "raceline") ? "raceline" : "classic"} />
    </> : <p className="card empty">Aucun circuit de test dans ce fichier.</p>}
    <section className="card">
      <h3 className="card-title">Résultats détaillés de la série v1</h3>
      <p className="note">Chaque graine compte autant. Le temps moyen ne porte que sur les tours bouclés.</p>
      <ChartTable title="Évaluation par pilote, adhérence et groupe de circuits" columns={[
        "Agent ou référence", "Adhérence", "Circuits", "Taux moyen", "Temps moyen (s)", "Sorties par essai", "Essais",
      ]} rows={detailed.map((entry) => [conditionLabel(entry.condition), muTick(entry.mu), SPLITS[entry.split] ?? entry.split,
        formatPercent(entry.rate), formatNumber(entry.lapTime), formatNumber(entry.offtracks), entry.episodes])} />
    </section>
  </>;
}

export default function Analytics() {
  const [series, setSeries] = useState("v2");
  const [checkpoint, setCheckpoint] = useState("best");
  const [metadata, setMetadata] = useState(null);
  const [evaluations, setEvaluations] = useState({});
  const [showcase, setShowcase] = useState(null);
  const [learning, setLearning] = useState({});
  const evalKey = series === "v2" ? "v2" : checkpoint;
  const current = evaluations[evalKey];
  const progress = learning[series];

  useEffect(() => {
    let active = true;
    async function load() {
      if (await getMode() !== "server") return { offline: true };
      const [runs, tracks] = await Promise.all([listRuns(), listTracks().catch(() => EMPTY)]);
      return { runs, names: new Map(tracks.map(({ id, name }) => [id, name.split(" (")[0]])) };
    }
    load().then((result) => { if (active) setMetadata(result); })
      .catch(() => { if (active) setMetadata({ error: true }); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!metadata?.runs || current) return;
    let active = true;
    const v2 = evalKey === "v2";
    const request = v2 ? loadF1EvalV2() : loadAnalyticsEvalV1(evalKey);
    evaluationSource(request, metadata.runs, v2).then((data) => {
      if (active) setEvaluations((previous) => ({ ...previous, [evalKey]: data }));
    });
    return () => { active = false; };
  }, [metadata, evalKey, current]);

  useEffect(() => {
    if (!metadata?.runs || series !== "v2" || showcase) return;
    let active = true;
    evaluationSource(loadShowcaseEvalV2(), metadata.runs).then((result) => {
      if (active) setShowcase(result);
    });
    return () => { active = false; };
  }, [metadata, series, showcase]);

  useEffect(() => {
    if (!metadata?.runs || progress) return;
    let active = true;
    const runs = metadata.runs.filter(({ condition }) => condition && !isReference(condition) && isF1Condition(condition) === (series === "v2"));
    Promise.all(runs.map(async (run) => ({ ...run, rows: await loadProgress(run.run_id) }))).then((data) => {
      if (!active) return;
      const sources = data.filter(({ rows }) => rows.length);
      setLearning((previous) => ({ ...previous, [series]: { sources, missing: data.length - sources.length } }));
    }).catch(() => { if (active) setLearning((previous) => ({ ...previous, [series]: { error: true } })); });
    return () => { active = false; };
  }, [metadata, series, progress]);

  const rows = current?.rows ?? EMPTY;
  const tests = useMemo(() => rows.filter(({ split }) => split === "test"), [rows]);
  const entries = useMemo(() => summarizeTrials(tests), [tests]);
  const mus = muValues(tests);
  const trackName = (id) => metadata?.names?.get(id) ?? id;
  const testCount = new Set(tests.map(({ track_id }) => track_id)).size;
  const trainCount = new Set(showcase?.rows?.filter(({ split }) => split === "train").map(({ track_id }) => track_id)).size;

  return <div className="stack analytics-page">
    <header className="page-header">
      <h2>Performance Analytics — Résultats des expériences</h2>
      <p>Le premier défi est de finir un tour. Ensuite, on peut se demander quels pilotes restent fiables quand la piste glisse et lesquels roulent le plus vite.</p>
    </header>
    <section className="card analytics-intro" aria-label="Choisir les expériences à comparer">
      <label className="field analytics-select">Série d’expériences
        <select value={series} onChange={(event) => setSeries(event.target.value)} aria-describedby="analytics-series-guide">
          {Object.entries(SERIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <p id="analytics-series-guide">{series === "v2"
        ? <>Les agents s’entraînent sur {trainCount ? `${trainCount} ` : "des "}circuits réels avec une voiture qui tient compte de l’aérodynamique.
          On teste ensuite leur meilleure sauvegarde sur {testCount ? `${testCount} ` : "des "}circuits de F1 qu’ils n’ont jamais vus.</>
        : <>La première série utilise une voiture simplifiée et des circuits générés. Elle sert à comparer les méthodes dans un environnement différent.</>}</p>
      <p className="note">Ne comparez pas les deux séries comme si seule la méthode avait changé : voiture et circuits diffèrent aussi.</p>
      {series === "v1" && <label className="field analytics-select">Point de sauvegarde évalué
        <select value={checkpoint} onChange={(event) => setCheckpoint(event.target.value)}>
          <option value="best">Meilleur pendant l’apprentissage</option><option value="last">Dernier, à la fin de l’apprentissage</option>
        </select>
      </label>}
    </section>
    {!metadata ? <p role="status">Connexion au serveur…</p>
      : metadata.offline ? <p className="card warn">Le serveur est absent. Les graphiques ne présentent que les résultats réels du projet.</p>
      : metadata.error ? <p className="card warn" role="alert">Impossible de charger la liste des entraînements.</p>
      : <div className="stack" key={evalKey}>
        {entries.length > 0 && <Takeaways entries={entries} />}
        {current?.unclassified > 0 && <p className="warn" role="status">{current.unclassified} épisodes ignorés : leur méthode n’est pas identifiée par le serveur.</p>}
        {!rows.length ? <MissingEvaluation source={current} label="l’évaluation de cette série" />
          : series === "v1" ? <V1Evaluation rows={rows} entries={entries} checkpoint={checkpoint} trackName={trackName} />
          : <>
            <V2Laps entries={entries} mus={mus} />
            <V2Heatmap rows={tests} entries={entries} mus={mus} trackName={trackName} />
            <V2Outcomes entries={entries} />
            <LapTimes rows={tests} entries={entries} trackName={trackName} />
            <Robustness entries={entries} mus={mus} />
          </>}
        {series === "v2" && <>
          {showcase?.unclassified > 0 && <p className="warn" role="status">{showcase.unclassified} épisodes de démonstration sans méthode identifiée.</p>}
          {showcase?.rows?.length ? <V2Showcase rows={showcase.rows} /> : <MissingEvaluation source={showcase} label="la démonstration" />}
        </>}
        <AnalyticsLearning progress={progress} />
      </div>}
    <details className="card analytics-glossary">
      <summary>Glossaire : les mots utiles pour lire cette page</summary>
      <dl>{Object.entries(GLOSSARY).map(([term, definition]) => <div key={term}><dt>{term}</dt><dd>{definition}</dd></div>)}</dl>
    </details>
  </div>;
}
