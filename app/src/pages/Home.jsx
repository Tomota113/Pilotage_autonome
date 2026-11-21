import { useEffect, useState } from "react";
import { CONDITIONS, conditionColor, conditionLabel } from "../data/algorithms.js";
import { listRuns, loadBestEval, loadF1Eval } from "../data/api.js";
import { identifyF1Rows } from "../data/f1.js";

const MODULES = [
  ["race", "Race Simulator", "Regarder un agent faire un tour, avec ses capteurs, sa vitesse et ses commandes."],
  ["championship", "AI Championship", "Faire courir tous les agents ensemble sur le même circuit."],
  ["analytics", "Performance Analytics", "Comparer les algorithmes : tours bouclés, robustesse, apprentissage."],
  ["network", "Neural Network Explorer", "Voir ce que reçoit le réseau de neurones et ce qu'il décide."],
  ["designer", "Track Designer", "Dessiner un nouveau circuit et l'exporter."],
  ["training", "Training Center", "Lancer un entraînement depuis le navigateur et le suivre en direct."],
];

const pct = (x) => `${Math.round(100 * x)} %`;

// Taux de tours bouclés par condition sur les circuits de test, avec le même poids par graine.
function lapRates(rows, conditionOf, mu) {
  const perSeed = {};
  for (const r of rows) {
    const c = conditionOf(r);
    if (!c || r.split !== "test" || (mu != null && Number(r.mu_factor) !== mu)) continue;
    const key = `${c}|${r.seed}`;
    perSeed[key] ??= { c, laps: 0, n: 0 };
    perSeed[key].laps += r.outcome === "lap" ? 1 : 0;
    perSeed[key].n += 1;
  }
  const byCondition = {};
  for (const { c, laps, n } of Object.values(perSeed)) (byCondition[c] ??= []).push(laps / n);
  return Object.fromEntries(Object.entries(byCondition).map(([c, v]) => [c, v.reduce((a, b) => a + b, 0) / v.length]));
}

function Tile({ label, value, detail, color }) {
  return (
    <div className="stat-tile" style={{ borderTop: `3px solid ${color ?? "var(--line)"}` }}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="detail">{detail}</div>
    </div>
  );
}

export default function Home() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    Promise.all([loadBestEval(), listRuns(), loadF1Eval().catch(() => [])]).then(([rows, runs, f1Rows]) => {
      const byRun = Object.fromEntries(runs.map((r) => [r.run_id, r.condition]));
      const conditionOf = (r) => (String(r.run_id).startsWith("classic") ? "classic" : byRun[r.run_id]);
      const n = runs.filter((r) => r.condition).length;
      setStats({ normal: lapRates(rows, conditionOf, 1), slippery: lapRates(rows, conditionOf, 0.6), runs: n, episodes: rows.length,
        f1: lapRates(identifyF1Rows(f1Rows, runs), (row) => row.condition), f1Episodes: f1Rows.length });
    }).catch(() => setStats({ normal: {}, slippery: {}, runs: 0, episodes: 0, f1: {}, f1Episodes: 0 }));
  }, []);

  const best = (rates) => Object.entries(rates).filter(([c]) => c !== "classic" && c !== "raceline").sort((a, b) => b[1] - a[1])[0];
  const bestNormal = stats && best(stats.normal);
  const bestSlippery = stats && best(stats.slippery);
  const bestF1 = stats && best(stats.f1);

  return (
    <>
      <div className="page-header">
        <h2>Des voitures qui apprennent à piloter</h2>
        <p>Des agents d'apprentissage par renforcement apprennent seuls à conduire une monoplace sur des circuits 2D, par essais
          et erreurs. On compare plusieurs algorithmes à un pilote classique programmé à la main, puis on mesure ce qui se
          passe quand la piste devient glissante.</p>
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">1. La voiture perçoit</div>
          <p className="note" style={{ margin: 0 }}>7 capteurs mesurent la distance aux bords (jusqu'à 100 m), plus la vitesse,
            l'angle par rapport à la piste, l'écart au centre et la courbure des virages à venir : 12 nombres.</p>
        </div>
        <div className="card">
          <div className="card-title">2. L'agent décide</div>
          <p className="note" style={{ margin: 0 }}>Toutes les 0,05 s, il choisit le volant, l'accélérateur et le frein. Il gagne des
            points en avançant et en bouclant un tour, il en perd s'il sort de la piste.</p>
        </div>
        <div className="card">
          <div className="card-title">3. On évalue</div>
          <p className="note" style={{ margin: 0 }}>Après 1 million de pas d'entraînement sur 10 circuits, chaque agent roule sur 5
            circuits qu'il n'a jamais vus, à adhérence normale, humide et glissante.</p>
          <p className="note" style={{ marginBottom: 0 }}>On teste aussi les agents sur 8 circuits de F1 réels qu’ils n’ont jamais vus.</p>
        </div>
      </div>

      <div className="card-title" style={{ fontSize: 17 }}>Résultats clés <span className="hint">calculés sur les évaluations réelles</span></div>
      {stats === null ? <p className="note">Chargement…</p> : (
        <div className="grid-3" style={{ marginBottom: 20 }}>
          <Tile label="Pilote classique (référence)" value={stats.normal.classic != null ? pct(stats.normal.classic) : "—"}
                detail="de tours bouclés sur les circuits de test, à toutes les adhérences" color={conditionColor("classic")} />
          {bestNormal && <Tile label={`Meilleur agent, adhérence normale : ${conditionLabel(bestNormal[0])}`} value={pct(bestNormal[1])}
                               detail="de tours bouclés sur les 5 circuits de test, jamais vus" color={conditionColor(bestNormal[0])} />}
          {bestSlippery && <Tile label={`Le plus robuste, piste glissante (μ 0,6) : ${conditionLabel(bestSlippery[0])}`} value={pct(bestSlippery[1])}
                                 detail="les autres agents ne bouclent presque plus aucun tour" color={conditionColor(bestSlippery[0])} />}
          <Tile label="Entraînements (1 million de pas chacun)" value={stats.runs} detail={`${stats.episodes} épisodes d'évaluation`} />
          {bestF1 ? <Tile label={`Meilleur agent sur les circuits de F1 · ${conditionLabel(bestF1[0])}`} value={pct(bestF1[1])}
                          detail="de tours bouclés, toutes adhérences confondues" color={conditionColor(bestF1[0])} />
            : stats.f1Episodes > 0 && <Tile label="Évaluation sur les circuits de F1" value={stats.f1Episodes} detail="essais enregistrés" />}
        </div>
      )}

      {stats && Object.keys(stats.normal).length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">Tours bouclés sur les circuits de test <span className="hint">adhérence normale · piste glissante</span></div>
          <table>
            <thead><tr><th>Agent</th><th className="num">Normale (μ 1,0)</th><th className="num">Glissante (μ 0,6)</th></tr></thead>
            <tbody>
              {CONDITIONS.filter((c) => stats.normal[c.id] != null).map((c) => (
                <tr key={c.id}>
                  <td><span className="swatch" style={{ background: c.color }} />{c.label} <span className="note">— {c.help}</span></td>
                  <td className="num">{pct(stats.normal[c.id])}</td>
                  <td className="num">{stats.slippery[c.id] != null ? pct(stats.slippery[c.id]) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">Moyenne des 3 graines (3 entraînements indépendants par algorithme) : la variance entre graines est forte,
            ces chiffres donnent des tendances. Détails dans Performance Analytics.</p>
        </div>
      )}

      <div className="card-title" style={{ fontSize: 17 }}>Par où commencer ?</div>
      <div className="grid-3">
        {MODULES.map(([key, title, text]) => (
          <a key={key} href={`#/${key}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="card-title">{title} →</div>
            <p className="note" style={{ margin: 0 }}>{text}</p>
          </a>
        ))}
      </div>
    </>
  );
}
