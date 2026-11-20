import { useEffect, useState } from "react";
import { getMode } from "./data/api.js";
import { PlaybackProvider } from "./playback.jsx";
import RaceSimulator from "./pages/RaceSimulator.jsx";
import Championship from "./pages/Championship.jsx";
import TrackDesigner from "./pages/TrackDesigner.jsx";
import Analytics from "./pages/Analytics.jsx";
import NetworkExplorer from "./pages/NetworkExplorer.jsx";
import TrainingCenter from "./pages/TrainingCenter.jsx";

// Une page par module, choisie par le fragment de l'URL (#/race, #/network...)
const PAGES = [
  ["race", "Race Simulator", RaceSimulator],
  ["championship", "AI Championship", Championship],
  ["designer", "Track Designer", TrackDesigner],
  ["analytics", "Performance Analytics", Analytics],
  ["network", "Neural Network Explorer", NetworkExplorer],
  ["training", "Training Center", TrainingCenter],
];

function currentPage() {
  const key = window.location.hash.replace(/^#\/?/, "");
  return PAGES.find(([k]) => k === key) ?? PAGES[0];
}

export default function App() {
  const [page, setPage] = useState(currentPage);
  const [mode, setMode] = useState(null);
  useEffect(() => {
    const onHash = () => setPage(currentPage());
    window.addEventListener("hashchange", onHash);
    getMode().then(setMode);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const [key, , Page] = page;
  return (
    <PlaybackProvider>
      <div className="layout">
        <nav className="sidebar">
          <h1>F1-RL Lab</h1>
          {PAGES.map(([k, label]) => (
            <a key={k} href={`#/${k}`} className={k === key ? "active" : ""}>{label}</a>
          ))}
          <div className="mode">
            {mode === "server" && "Données : serveur (fichiers réels)"}
            {mode === "fixtures" && "Données : FIXTURE (serveur absent)"}
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
