import { useMemo, useState } from "react";
import TrackCanvas from "../components/TrackCanvas.jsx";
import ReplayPicker from "../components/ReplayPicker.jsx";
import EpisodeCharts from "../components/network/EpisodeCharts.jsx";
import NetworkDiagram from "../components/network/NetworkDiagram.jsx";
import { ActivationBars, ObservationBars } from "../components/network/NetworkReadings.jsx";
import { conditionColor } from "../data/algorithms.js";
import { getActionMode, getAgentKind, getPerception } from "../data/network.js";
import { PlaybackControls, usePlayback } from "../playback.jsx";
import "../components/network/network.css";

const CURVE_THRESHOLD = 0.1;
const GLOSSARY = [
  ["Neurone", "Petit calcul qui combine plusieurs nombres et en produit un nouveau."],
  ["Couche", "Groupe de neurones qui reçoivent les mêmes entrées."],
  ["Activation", "Nombre produit par un neurone pour les entrées de cet instant."],
  ["Poids", "Nombre appris qui règle l’influence d’une entrée dans le calcul d’un neurone."],
  ["Normalisation", "Conversion d’une mesure vers une échelle commune, ici de −1 à +1."],
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
  return <div className="network-guide">
    <section className="card">
      <h3 className="card-title">Comment le réseau a appris</h3>
      <p>À l’entraînement, la voiture a fait des essais et des erreurs en répétant des épisodes.
        La récompense lui donnait des points pour avancer et terminer un tour, et lui en retirait si elle sortait de la piste.
        L’algorithme utilisait ces retours pour calculer une erreur, puis la rétropropagation indiquait comment ajuster les poids du réseau.</p>
    </section>
    <section className="card">
      <h3 className="card-title">Mini glossaire</h3>
      <dl>{GLOSSARY.map(([term, definition]) => <div key={term}><dt>{term}</dt><dd>{definition}</dd></div>)}</dl>
    </section>
  </div>;
}

export default function NetworkExplorer() {
  const { entry, replay, track, index, error } = usePlayback();
  const [onlyWithActivations, setOnlyWithActivations] = useState(() => Boolean(entry?.has_activations));
  const frame = replay?.frames[index];
  const car = replay?.car ?? entry?.car ?? "v1";
  const algo = replay?.agent.algo;
  const kind = getAgentKind(algo);
  const isNetwork = kind === "network";
  const mode = replay && getActionMode(replay);
  const layers = replay?.network?.layers;
  const recordedLayers = useMemo(() => replay?.frames.find(
    ({ activations }) => activations?.some((values) => values.length),
  )?.activations, [replay]);
  const layerSizes = layers?.slice(1, -1) ?? recordedLayers?.map((values) => values.length);

  return <div className="stack network-explorer">
    <header className="page-header">
      <h2>Comprendre le réseau de neurones</h2>
      <p>Choisis un replay et avance image par image pour relier ce que voit la voiture aux commandes qu’elle reçoit.</p>
    </header>
    <div>
      <label className="network-filter">
        <input type="checkbox" checked={onlyWithActivations} onChange={(event) => setOnlyWithActivations(event.target.checked)} />
        Afficher uniquement les replays avec activations
      </label>
      <ReplayPicker onlyWithActivations={onlyWithActivations} />
    </div>
    {entry && !frame && !error && <p role="status">Chargement du replay…</p>}
    {frame && <>
      {isNetwork
        ? <NetworkDiagram inputCount={layers?.[0] ?? frame.obs.length} layerSizes={layerSizes} mode={mode}
                          algo={algo} sensorRange={getPerception(car).sensorRange} />
        : <NoNetwork kind={kind} car={car} />}
      <section className="card">
        <h3 className="card-title">La voiture sur le circuit</h3>
        {track && <TrackCanvas track={track} height={270} cars={[{ ...frame, color: conditionColor(entry?.condition) }]}
          rays={{ x: frame.x, y: frame.y, psi: frame.psi, distances: frame.sensors_m }} />}
        <PlaybackControls />
        <p>{describeFrame(frame, car)}</p>
      </section>
      {Number.isFinite(frame.t) && Number.isFinite(frame.v) &&
        <EpisodeCharts frames={replay.frames} index={index} mode={mode} />}
      <div className="network-guide">
        <ObservationBars frame={frame} previousFrame={replay.frames[index - 1]} car={car} track={track} isNetwork={isNetwork} />
        {isNetwork && <ActivationBars frame={frame} car={car} mode={mode} layerSizes={layerSizes}
                                     hasActivations={Boolean(recordedLayers)} />}
      </div>
    </>}
    {(!frame || isNetwork) && <LearningGuide />}
  </div>;
}
