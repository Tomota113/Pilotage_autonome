import { useEffect, useMemo, useState } from "react";
import TrackCanvas from "../components/TrackCanvas.jsx";
import ReplayPicker from "../components/ReplayPicker.jsx";
import EpisodeCharts from "../components/network/EpisodeCharts.jsx";
import NetworkDiagram from "../components/network/NetworkDiagram.jsx";
import NetworkPlayback from "../components/network/NetworkPlayback.jsx";
import { ActivationBars, ObservationBars } from "../components/network/NetworkReadings.jsx";
import { conditionColor, replayTitle } from "../data/algorithms.js";
import { getActionMode, getAgentKind, getPerception, pickNetworkReplay } from "../data/network.js";
import { listReplays } from "../data/api.js";
import { usePlayback } from "../playback.jsx";
import "../components/network/network.css";

const CURVE_THRESHOLD = 0.1;
const GLOSSARY = [
  ["Neurone", "Petit calcul qui combine plusieurs nombres et en produit un nouveau."],
  ["Couche", "Groupe de neurones qui reçoivent les mêmes entrées."],
  ["Activation", "Nombre produit par un neurone pour les entrées de cet instant."],
  ["Poids", "Nombre appris qui règle l’influence d’une entrée dans le calcul d’un neurone."],
  ["Normalisation", "Conversion d’une mesure vers une échelle commune, ici de −1 à +1."],
  ["Valeur Q", "Estimation des récompenses futures pondérées si l’agent choisit une action dans cette situation."],
];

export function describeFrame({ obs, action }, car) {
  const [near, far] = getPerception(car).lookahead;
  const curveAtNear = obs[10];
  const curveAtFar = obs[11];
  const distance = Math.abs(curveAtFar) > CURVE_THRESHOLD ? far : Math.abs(curveAtNear) > CURVE_THRESHOLD ? near : null;
  const curve = distance === far ? curveAtFar : curveAtNear;
  const road = distance ? `La voiture détecte un virage à ${curve > 0 ? "gauche" : "droite"} à ${distance} m`
    : `La voiture ne détecte pas de virage marqué à ${near} ni à ${far} m`;
  const steering = Math.abs(action.steer) > 0.15 ? ` et braque à ${action.steer > 0 ? "gauche" : "droite"}` : "";
  const command = action.brake > 0.5 ? "freine"
    : action.throttle > 0.5 ? "accélère"
    : action.brake > 0.05 ? "freine légèrement"
    : action.throttle > 0.05 ? "accélère légèrement" : "roule sans accélérer ni freiner franchement";
  return `${road}. À cet instant, elle ${command}${steering}.`;
}

function NoNetwork({ kind, car }) {
  return <section className="card">
    <h3 className="card-title">Cet agent pilote sans réseau de neurones</h3>
    <p>{kind === "tabular"
      ? `L’agent regroupe les situations de conduite en ${car === "f1_2024" ? "5 760" : "768"} états. Sa table Q contient, pour chaque état, un score appris pour chacune des neuf actions possibles.`
      : "Ce pilote applique des règles programmées pour choisir sa direction et sa vitesse."}</p>
    <p className="note">Utilise le curseur pour comparer ses commandes avec la vitesse et les mesures de la voiture sur le circuit.</p>
  </section>;
}

function LearningGuide() {
  return <details className="card network-details">
    <summary>En savoir plus sur l’apprentissage et le vocabulaire</summary>
    <div className="network-guide">
      <section>
        <h3 className="card-title">Comment le réseau a appris</h3>
        <p>À l’entraînement, la voiture a fait des essais et des erreurs en répétant des épisodes.
          La récompense lui donnait des points pour avancer et terminer un tour, et lui en retirait si elle sortait de la piste.
          L’algorithme utilisait ces retours pour calculer une erreur, puis la rétropropagation indiquait comment ajuster les poids du réseau.</p>
      </section>
      <section>
        <h3 className="card-title">Mini glossaire</h3>
        <dl>{GLOSSARY.map(([term, definition]) => <div key={term}><dt>{term}</dt><dd>{definition}</dd></div>)}</dl>
      </section>
    </div>
  </details>;
}

export default function NetworkExplorer() {
  const { entry, replay, track, index, error, select, playing, speed } = usePlayback();
  const [showCar, setShowCar] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [automatic, setAutomatic] = useState(null);
  const [excluded, setExcluded] = useState(() => new Set());
  const frame = replay?.frames[index];
  const car = replay?.car ?? entry?.car ?? "v1";
  const algo = replay?.agent.algo;
  const kind = getAgentKind(algo);
  const mode = replay && (getActionMode(replay) ?? (car === "f1_2024" && kind === "network" ? "pedal" : null));
  const layerSizes = useMemo(() => {
    const recorded = replay?.frames.find(({ activations }) => activations?.some((values) => values.length))?.activations;
    return recorded?.map((values) => values.length);
  }, [replay]);
  const needsReplay = !entry || (replay ? !layerSizes : !entry.has_activations || Boolean(error && automatic?.path === entry.path));
  const fallback = useMemo(() => {
    if (!needsReplay || !catalog) return null;
    const unavailable = new Set(excluded);
    if (entry) unavailable.add(entry.path);
    return pickNetworkReplay(catalog, unavailable);
  }, [needsReplay, catalog, excluded, entry]);

  useEffect(() => {
    if (!needsReplay || catalog !== null) return undefined;
    let active = true;
    listReplays().then((replays) => { if (active) setCatalog(replays); })
      .catch(() => { if (active) setCatalog([]); });
    return () => { active = false; };
  }, [needsReplay, catalog]);

  useEffect(() => {
    if (!fallback) return;
    // Le catalogue détecte la clé « activations ». Le replay chargé confirme qu’elle contient des valeurs.
    if (entry) setExcluded((previous) => new Set(previous).add(entry.path));
    setAutomatic({ path: fallback.path, replaced: Boolean(entry) });
    select(fallback);
  }, [fallback, select, entry]);

  const choosing = needsReplay && (catalog === null || fallback);
  const pulseDuration = playing ? Math.max(20, Math.min(200, ((replay?.dt ?? 0.05) * 1000) / speed - 6)) : 220;

  return <div className="stack network-explorer">
    <header className="page-header">
      <h2>Neural Network Explorer</h2>
      <p>Suivez une décision, des capteurs aux commandes de la voiture.</p>
    </header>
    <div className="network-replay">
      {choosing ? <p role="status">Recherche d’un replay avec activations…</p>
        : <ReplayPicker onlyWithActivations={Boolean(entry?.has_activations && (!replay || layerSizes))} />}
      {entry && automatic && automatic.path === entry.path && !error && <p className="network-replay-note" role="status">
        {automatic.replaced ? "Le replay précédent ne permettait pas de voir les activations. " : ""}
        Replay choisi pour le schéma · {replayTitle(entry)}
      </p>}
      {entry && !frame && !error && !choosing && <p role="status">Chargement du replay…</p>}
    </div>
    {frame && !choosing && <>
      <NetworkPlayback />
      {layerSizes ? <NetworkDiagram key={entry?.path ?? replay.run_id} frames={replay.frames} index={index} car={car} track={track}
        layerSizes={layerSizes} mode={mode} algo={algo} pulseDuration={pulseDuration} />
        : kind !== "network" ? <NoNetwork kind={kind} car={car} /> : <p className="card warn">Aucune activation enregistrée pour ce replay.</p>}
      {Number.isFinite(frame.t) && Number.isFinite(frame.v) &&
        <EpisodeCharts frames={replay.frames} index={index} mode={mode} />}
      {layerSizes && <ActivationBars frame={frame} layerSizes={layerSizes} />}
      <details className="card network-details" open={showCar} onToggle={(event) => setShowCar(event.currentTarget.open)}>
        <summary>En savoir plus sur la voiture et ses mesures</summary>
        {showCar && <>
          <p>{describeFrame(frame, car)}</p>
          {track && <TrackCanvas track={track} height={270} cars={[{ ...frame, color: conditionColor(entry?.condition) }]}
            rays={{ x: frame.x, y: frame.y, psi: frame.psi, distances: frame.sensors_m }} />}
          <ObservationBars frame={frame} previousFrame={replay.frames[index - 1]} car={car} track={track} isNetwork={kind === "network"} />
        </>}
      </details>
    </>}
    <LearningGuide />
  </div>;
}
