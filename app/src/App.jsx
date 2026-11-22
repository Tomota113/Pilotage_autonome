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
  screen: "M3 4h18v13H3zM8 21h8m-4-4v4",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19m0-14-1.5 1.5m-11 11L5 19M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0z",
  moon: "M20.9 13.4A9 9 0 0 1 10.6 3.1 9 9 0 1 0 20.9 13.4z",
  previous: "M14 6l-6 6 6 6",
  next: "M10 6l6 6-6 6",
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

function readPreference(key) {
  try { return window.localStorage.getItem(key) === "true"; }
  catch { return false; }
}

function savePreference(key, enabled) {
  try { window.localStorage.setItem(key, String(enabled)); }
  catch { /* Le réglage reste actif pour la session. */ }
}

export default function App() {
  const [page, setPage] = useState(currentPage);
  const [mode, setMode] = useState(null);
  const [presentation, setPresentation] = useState(() => readPreference("f1rl.presentation"));
  const [light, setLight] = useState(() => readPreference("f1rl.light"));
  const [key, label, Page] = page;
  const pageIndex = PAGES.indexOf(page);
  const adjacent = (direction) => PAGES[(pageIndex + direction + PAGES.length) % PAGES.length];
  const themeLabel = light ? "Activer le thème sombre" : "Activer le thème clair";

  useEffect(() => {
    const onHash = () => { setPage(currentPage()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    getMode().then(setMode);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.presentation = String(presentation);
    savePreference("f1rl.presentation", presentation);
  }, [presentation]);

  useEffect(() => {
    document.documentElement.dataset.theme = light ? "light" : "dark";
    savePreference("f1rl.light", light);
  }, [light]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey
        || event.target?.closest?.("input, select, textarea, [contenteditable], [role=slider]")) return;
      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        setPresentation((enabled) => !enabled);
      }
      if (presentation && !document.fullscreenElement && !event.target?.closest?.("[role=tablist], [role=region][tabindex]")
        && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        const step = event.key === "ArrowRight" ? 1 : -1;
        event.preventDefault();
        window.location.hash = `/${PAGES[(pageIndex + step + PAGES.length) % PAGES.length][0]}`;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pageIndex, presentation]);

  return (
    <PlaybackProvider>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">F1</span>
            <span className="brand-copy">F1-RL Lab<small>Pilotage par renforcement</small></span>
          </div>
          <nav className="module-nav" aria-label="Modules">
            {SECTIONS.map(([title, pages]) => (
              <div key={title}>
                <div className="nav-section">{title}</div>
                {pages.map(([k, name]) => (
                  <a key={k} href={`#/${k}`} aria-label={name} title={name} aria-current={k === key ? "page" : undefined}>
                    <Icon name={k} /><span>{name}</span>
                  </a>
                ))}
              </div>
            ))}
          </nav>
          <div className="display-settings">
            <button type="button" aria-pressed={presentation} aria-label="Mode présentation" aria-keyshortcuts="P"
                    title="Mode présentation (P)" onClick={() => setPresentation((enabled) => !enabled)}>
              <Icon name="screen" /><span>Mode présentation</span><kbd>P</kbd>
            </button>
            <button type="button" aria-label={themeLabel} title={themeLabel} onClick={() => setLight((enabled) => !enabled)}>
              <Icon name={light ? "moon" : "sun"} /><span>{light ? "Thème sombre" : "Thème clair"}</span>
            </button>
          </div>
          <div className="mode">
            {mode === "server" && <><span className="mode-dot" />Données réelles (serveur)</>}
            {mode === "fixtures" && <><span className="mode-dot fixture" />FIXTURE (serveur absent)</>}
          </div>
        </aside>
        <main>
          {presentation && <nav className="presentation-nav" aria-label="Navigation de présentation">
            <span aria-live="polite">{label}</span>
            <div>
              {[-1, 1].map((step) => {
                const [destination, name] = adjacent(step);
                return <a key={step} href={`#/${destination}`} aria-label={name}
                          title={`${step < 0 ? "←" : "→"} ${name}`}
                          aria-keyshortcuts={step < 0 ? "ArrowLeft" : "ArrowRight"}>
                  <Icon name={step < 0 ? "previous" : "next"} />
                </a>;
              })}
            </div>
          </nav>}
          {mode === "fixtures" && (
            <div className="fixture-banner">
              FIXTURE — données factices de développement (serveur absent). Ne pas utiliser en démonstration.
            </div>
          )}
          <div className="page-content" key={key}><Page mode={mode} /></div>
        </main>
      </div>
    </PlaybackProvider>
  );
}
