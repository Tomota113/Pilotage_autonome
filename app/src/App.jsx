import { useEffect, useState } from "react";
import { getMode } from "./data/api.js";
import { PlaybackProvider } from "./playback.jsx";
import Home from "./pages/Home.jsx";
import RaceSimulator from "./pages/RaceSimulator.jsx";
import Championship from "./pages/Championship.jsx";
import TrackDesigner from "./pages/TrackDesigner.jsx";
import Analytics from "./pages/Analytics.jsx";
import NetworkExplorer from "./pages/NetworkExplorer.jsx";
import TrainingCenter from "./pages/TrainingCenter.jsx";

// Icônes simples (traits), pour repérer les modules d'un coup d'œil
const ICONS = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  race: "M5 17h14M7 17l2-6h6l2 6M9 11l1-3h4l1 3M7 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  championship: "M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3",
  analytics: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  network: "M5 6a2 2 0 1 0 0 .1M5 18a2 2 0 1 0 0 .1M19 12a2 2 0 1 0 0 .1M12 6a2 2 0 1 0 0 .1M12 18a2 2 0 1 0 0 .1M7 6h3M7 18h3M14 6l3 5M14 18l3-5",
  designer: "M4 20l4-1 11-11-3-3L5 16zM14 6l3 3",
  training: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6",
};

const SECTIONS = [
  ["Découvrir", [["home", "Accueil", Home]]],
  ["Voir les agents piloter", [
    ["race", "Race Simulator", RaceSimulator],
    ["championship", "AI Championship", Championship],
  ]],
  ["Comprendre les résultats", [
    ["analytics", "Performance Analytics", Analytics],
    ["network", "Neural Network Explorer", NetworkExplorer],
  ]],
  ["Outils", [
    ["designer", "Track Designer", TrackDesigner],
    ["training", "Training Center", TrainingCenter],
  ]],
];
const PAGES = SECTIONS.flatMap(([, pages]) => pages);

function currentPage() {
  const key = window.location.hash.replace(/^#\/?/, "");
  return PAGES.find(([k]) => k === key) ?? PAGES[0];
}

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export default function App() {
  const [page, setPage] = useState(currentPage);
  const [mode, setMode] = useState(null);
  useEffect(() => {
    const onHash = () => { setPage(currentPage()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    getMode().then(setMode);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const [key, , Page] = page;
  return (
    <PlaybackProvider>
      <div className="layout">
        <nav className="sidebar" aria-label="Modules">
          <div className="brand">
            <div className="brand-mark">F1</div>
            <h1>F1-RL Lab<small>Pilotage par apprentissage par renforcement</small></h1>
          </div>
          {SECTIONS.map(([title, pages]) => (
            <div key={title}>
              <div className="nav-section">{title}</div>
              {pages.map(([k, label]) => (
                <a key={k} href={`#/${k}`} className={k === key ? "active" : ""}><Icon name={k} />{label}</a>
              ))}
            </div>
          ))}
          <div className="mode">
            {mode === "server" && <><span className="mode-dot" />Données réelles (serveur)</>}
            {mode === "fixtures" && <><span className="mode-dot fixture" />FIXTURE (serveur absent)</>}
          </div>
        </nav>
        <main>
          {mode === "fixtures" && (
            <div className="fixture-banner">
              FIXTURE — données factices de développement (serveur absent). Ne pas utiliser en démonstration.
            </div>
          )}
          <Page mode={mode} />
        </main>
      </div>
    </PlaybackProvider>
  );
}
