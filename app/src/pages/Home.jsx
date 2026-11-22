import { useEffect, useState } from "react";
import { evaluationRows, isReference, summarizeTakeaways, summarizeTrials } from "../data/analytics.js";
import { conditionColor, conditionLabel } from "../data/algorithms.js";
import { listRuns, loadF1EvalV2 } from "../data/api.js";
import { identifyF1Rows } from "../data/f1.js";
import { shortPercent } from "../components/charts/AnalyticsChart.jsx";

const MODULES = [
  ["race", "Race Simulator", "Suivre un tour et lire la vitesse, les capteurs et les commandes."],
  ["championship", "AI Championship", "Rejouer les meilleurs tours et suivre le classement en direct."],
  ["analytics", "Performance Analytics", "Comparer les tours bouclés, les chronos et la résistance à une piste glissante."],
  ["network", "Neural Network Explorer", "Voir les informations qui entrent dans le réseau et les commandes qui en sortent."],
  ["designer", "Track Designer", "Dessiner un circuit, l’exporter et y faire rouler les agents."],
  ["training", "Training Center", "Lancer un entraînement et suivre la progression de l’agent."],
];

const STEPS = [
  ["La voiture perçoit", "Capteurs et vitesse", "M8 16h8v6H8zM5 11a11 11 0 0 1 14 0M2 7a16 16 0 0 1 20 0m-14 7a6 6 0 0 1 8 0"],
  ["Le réseau décide", "Volant, accélérateur et frein", "M4 5h4v4H4zM4 15h4v4H4zM16 10h4v4h-4zM8 7l8 4m-8 6 8-4"],
  ["Le simulateur avance", "La voiture se déplace", "M5 4h14l2 5-5 11H5l-2-5zM8 9h7l1 2-2 4H8l-1-2z"],
  ["L’agent est récompensé", "Progression et tours validés", "M5 21V3m0 2c5-4 9 4 14 0v10c-5 4-9-4-14 0"],
];

function CoverTrack() {
  const track = "M97 220C65 216 49 191 61 166L111 76Q122 56 149 61L354 93C379 98 388 115 372 130L325 171Q313 182 295 176L239 153Q218 144 206 164L175 206Q163 225 141 225Z";
  return <svg className="cover-track" viewBox="0 20 420 250" aria-hidden="true">
    <defs>
      <pattern id="cover-grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M0 20V0H20" fill="none" stroke="currentColor" opacity=".32" />
      </pattern>
    </defs>
    <path fill="url(#cover-grid)" d="M0 20h420v245H0z" />
    <path d={track} fill="none" stroke="currentColor" strokeWidth="30" opacity=".55" />
    <path d={track} fill="none" stroke="var(--hero-bg)" strokeWidth="23" />
    <path d={track} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 8" />
    <path d="M97 220C65 216 49 191 61 166L111 76Q122 56 149 61L250 77" fill="none" stroke="var(--hero-accent)" strokeWidth="3" />
    <g transform="translate(250 77) rotate(9)">
      <path d="M-13-9h18v18h-18z" fill="var(--hero-bg)" />
      <path d="M-13-9h6v6h-6zm12 0h6v6h-6zm-6 6h6v6h-6zm-6 6h6v6h-6zm12 0h6v6h-6z" fill="var(--hero-accent)" />
    </g>
  </svg>;
}

function Tile({ label, value, detail, condition }) {
  return (
    <div className="stat-tile" style={condition ? { "--metric-color": conditionColor(condition) } : undefined}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="detail">{detail}</div>
    </div>
  );
}

export default function Home({ mode }) {
  const [results, setResults] = useState(null);
  useEffect(() => {
    if (mode !== "server") return;
    let active = true;
    Promise.all([loadF1EvalV2(), listRuns()]).then(([rows, runs]) => {
      if (!active) return;
      const tests = (rows ?? []).filter(({ split }) => split === "test");
      const entries = summarizeTrials(evaluationRows(identifyF1Rows(tests, runs)));
      setResults({
        entries, circuits: new Set(tests.map(({ track_id }) => track_id).filter(Boolean)).size,
        leaders: summarizeTakeaways(entries).leaders,
      });
    }).catch(() => { if (active) setResults({ error: true }); });
    return () => { active = false; };
  }, [mode]);

  const leaders = results?.leaders ?? [];
  const references = results?.entries?.filter(({ condition }) => isReference(condition)) ?? [];

  return (
    <div className="home-page">
      <header className="cover-hero">
        <div className="cover-copy">
          <p className="cover-name">F1-RL Lab</p>
          <h1>Des voitures qui<br className="cover-break" /> apprennent à piloter</h1>
          <p>Apprentissage par renforcement sur des circuits de Formule 1.</p>
          <a className="cover-link" href="#/race">Voir un agent piloter <span aria-hidden="true">→</span></a>
        </div>
        <CoverTrack />
      </header>

      <section className="cover-section" aria-labelledby="cover-results">
        <div className="cover-section-heading">
          <h2 id="cover-results">Résultats sur les circuits de test</h2>
          <p>Série v2 · Taux de tours bouclés · Toutes adhérences testées</p>
        </div>
        {mode === "fixtures" ? <p className="note">Le serveur est nécessaire pour afficher les résultats v2.</p>
          : !results ? <p role="status">Chargement des résultats v2…</p>
          : results.error ? <p className="warn" role="alert">Impossible de charger les résultats v2.</p>
          : !results.circuits ? <p className="note">Aucun résultat v2 disponible.</p>
          : <div className="cover-metrics">
            {leaders.length > 0 && <Tile label={leaders.length === 1 ? "Meilleur agent appris" : "Meilleurs agents à égalité"}
              value={shortPercent(leaders[0].rate)} detail={leaders.map(({ condition }) => conditionLabel(condition)).join(" et ")}
              condition={leaders.length === 1 ? leaders[0].condition : undefined} />}
            {references.map(({ condition, rate }) => <Tile key={condition} label="Pilote de référence"
              value={shortPercent(rate)} detail={conditionLabel(condition)} condition={condition} />)}
            <Tile label="Circuits de test" value={results.circuits} detail="Circuits distincts dans l’évaluation v2" />
          </div>}
        {results?.entries?.length > 0 && <details className="explanation">
          <summary>En savoir plus sur les résultats</summary>
          <p>Le taux est la part des essais de test terminés par un tour complet dans <code>eval_f1_v2.csv</code>. Chaque essai compte
            une fois. Les pilotes de référence sont programmés et disposent d’informations sur le circuit et l’adhérence.</p>
        </details>}
      </section>

      <section className="cover-section" aria-labelledby="cover-loop">
        <div className="cover-section-heading"><h2 id="cover-loop">La boucle d’apprentissage</h2></div>
        <ol className="cover-flow">
          {STEPS.map(([title, detail, path], index) => <li key={title}>
            <svg className="flow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
            <div><strong>{title}</strong><span>{detail}</span></div>
            {index < STEPS.length - 1 && <svg className="flow-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.7" aria-hidden="true"><path d="M3 12h17m-6-6 6 6-6 6" /></svg>}
          </li>)}
        </ol>
      </section>

      <section className="cover-section" aria-labelledby="cover-modules">
        <div className="cover-section-heading"><h2 id="cover-modules">Explorer le labo</h2></div>
        <div className="grid-3">
          {MODULES.map(([key, title, description]) => (
            <a key={key} href={`#/${key}`} className="card module-link">
              <h3>{title} <span aria-hidden="true">↗</span></h3>
              <p>{description}</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
