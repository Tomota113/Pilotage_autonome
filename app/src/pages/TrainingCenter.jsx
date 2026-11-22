import { useEffect, useMemo, useRef, useState } from "react";
import TrackCanvas from "../components/TrackCanvas.jsx";
import LineChart, { formatNumber, formatPercent } from "../components/charts/LineChart.jsx";
import { identifyCondition } from "../components/charts/RunCondition.jsx";
import { ALGO_LABELS, OUTCOME_LABELS, conditionColor, muLabel } from "../data/algorithms.js";
import { listCheckpoints, listRuns, listTracks, loadProgress, loadTrack, openRunSocket, startRun, stopRun } from "../data/api.js";
import { ACTION_SPACES, buildTrainingYaml, TRAINING_DEFAULTS } from "../data/yaml.js";

const STATES = { running: "En cours", stopping: "Arrêt en cours", finished: "Terminé", failed: "Échec" };
const STATE_TONES = { running: "good", stopping: "warn", failed: "bad" };
const SPLITS = { train: "entraînement", test: "test", demo: "démonstration" };
const RATES = { ppo: 1300, dqn: 1400, sac: 200, qlearning: 3000, sarsa: 3000, montecarlo: 3000 };
const PRESETS = [
  { id: "quick", title: "Essai rapide", algo: "ppo", steps: 20000, circuit: "sur l’ovale" },
  { id: "ppo", title: "PPO sur les 10 circuits", algo: "ppo", steps: 200000 },
  { id: "sac", title: "SAC sur les 10 circuits", algo: "sac", steps: 100000 },
];
const REWARDS = {
  k_progress: "Progression (k)",
  c_time: "Coût du temps (c)",
  p_offtrack: "Pénalité de sortie",
  b_lap: "Bonus de tour",
  lambda_steer: "Pénalité de braquage (λ)",
};
const PROGRESS_FIELDS = [
  ["mean_reward", "Récompense moyenne"], ["lap_rate", "Tours valides (%)"],
  ["mean_lap_time", "Temps au tour (s)"], ["offtracks_per_ep", "Sorties par épisode"],
];
const FORMAT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const COMPACT_STEPS = new Intl.NumberFormat("fr-FR", { notation: "compact" });
const RECENT_ROWS = 30;

export function estimateDuration(algo, steps) {
  const seconds = Number(steps) / RATES[algo];
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return seconds < 60 ? `≈ ${formatNumber(Math.ceil(seconds / 5) * 5)} s`
    : `≈ ${formatNumber(Math.ceil(seconds / 60))} min`;
}

export function presetForm(presetId, tracks) {
  const preset = PRESETS.find(({ id }) => id === presetId);
  const oval = tracks.find(({ id }) => id === "demo_oval") ?? tracks.find(({ split }) => split === "demo");
  const train = tracks.filter(({ split }) => split === "train").map(({ id }) => id).sort().slice(0, 10);
  const test = tracks.filter(({ split }) => split === "test").map(({ id }) => id).sort();
  const quick = preset.id === "quick";
  if (quick ? !oval : train.length !== 10) return null;
  return {
    ...TRAINING_DEFAULTS, algo: preset.algo, totalSteps: preset.steps,
    trainTracks: quick ? [oval.id] : train, testTracks: quick ? [oval.id] : test,
  };
}

export function runIdentity(run, tracks) {
  const { algo, run_id: id, trainTracks } = run;
  const parts = id.match(/^[^_]+_(.+)_mu(?:fixe|alea)_s\d+_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(?:_|$)/);
  const date = parts ? new Date(+parts[2], +parts[3] - 1, +parts[4], +parts[5], +parts[6]) : null;
  const trackName = (trackId) => tracks.find(({ id }) => id === trackId)?.name ?? trackId;
  const trackId = trainTracks?.[0] ?? (parts && parts[1] !== "multi" ? parts[1] : null);
  const circuits = trainTracks?.length > 1 ? `${formatNumber(trainTracks.length)} circuits`
    : trainTracks?.length === 1 ? trackName(trainTracks[0])
    : parts?.[1] === "multi" ? "Plusieurs circuits"
    : parts ? trackName(parts[1]) : "Circuit non renseigné";
  return { algo: ALGO_LABELS[algo] ?? "Algorithme non renseigné", circuits, date, trackId };
}

function StateChip({ state }) {
  return <span className={`chip ${STATE_TONES[state] ?? ""}`}>{STATES[state] ?? "État inconnu"}</span>;
}

function NumberField({ label, value, onChange, min = 0, step = "any" }) {
  return (
    <label className="field">{label}
      <input type="number" min={min} step={step} required value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TrackOptions({ tracks }) {
  return tracks.map(({ id, name, split }) => <option key={id} value={id}>{name} ({SPLITS[split] ?? split})</option>);
}

function ConfigForm({ form, setForm, tracks, yaml, error, onSubmit, launching, mode }) {
  const field = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const number = (key, label, min, step) =>
    <NumberField label={label} value={form[key]} min={min} step={step} onChange={(value) => field(key, value)} />;
  function trackSelect(key, label) {
    return (
      <label className="field">{label}
        <select multiple size="4" value={form[key]}
                onChange={(event) => field(key, Array.from(event.target.selectedOptions, (option) => option.value))}>
          <TrackOptions tracks={tracks} />
        </select>
      </label>
    );
  }
  return (
    <div className="row training-config">
      <form className="panel" style={{ flex: "2 1 360px", minWidth: 0 }} onSubmit={onSubmit}>
        <h3>Configuration de l’entraînement</h3>
        <div className="module-fields">
          <label className="field">Algorithme
            <select value={form.algo} onChange={(event) => field("algo", event.target.value)}>
              {Object.keys(ACTION_SPACES).map((algo) => <option key={algo} value={algo}>{ALGO_LABELS[algo]}</option>)}
            </select>
          </label>
          <label className="field">Espace d’actions
            <output>{ACTION_SPACES[form.algo] === "continuous" ? "Continu" : "Discret (9 actions)"}</output>
          </label>
          {number("seed", "Graine", 0, 1)}
          {number("totalSteps", "Nombre total de pas", 1, 1)}
        </div>
        <fieldset>
          <legend>Circuits</legend>
          <div className="module-fields">
            {trackSelect("trainTracks", "Entraînement")}
            {trackSelect("testTracks", "Test")}
          </div>
          <p className="note">Maintenez Ctrl (⌘ sur Mac) pour sélectionner plusieurs circuits.</p>
        </fieldset>
        <fieldset>
          <legend>Adhérence</legend>
          <div className="module-fields">
            <label className="field">Mode d’adhérence
              <select value={form.muMode} onChange={(event) => field("muMode", event.target.value)}>
                <option value="fixed">Fixe</option>
                <option value="uniform">Aléatoire uniforme</option>
              </select>
            </label>
            {form.muMode === "fixed" ? number("muValue", "Facteur μ fixe") : (
              <>
                {number("muMin", "Facteur μ minimum")}
                {number("muMax", "Facteur μ maximum")}
              </>
            )}
          </div>
        </fieldset>
        <fieldset>
          <legend>Récompenses</legend>
          <div className="module-fields">
            {Object.entries(REWARDS).map(([key, label]) => (
              <NumberField key={key} label={label} value={form.reward[key]}
                           onChange={(value) => setForm((current) => ({ ...current, reward: { ...current.reward, [key]: value } }))} />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Sauvegarde et évaluation</legend>
          <div className="module-fields">
            {number("checkpointEvery", "Sauvegarder tous les N pas", 1, 1)}
            {number("evalEvery", "Évaluation tous les N pas", 1, 1)}
            {number("evalEpisodes", "Épisodes par évaluation", 1, 1)}
          </div>
        </fieldset>
        <div className="controls">
          <button type="submit" className="primary" disabled={mode !== "server" || !yaml || launching}>
            {launching ? "Lancement…" : "Lancer"}
          </button>
          <span className="note">{estimateDuration(form.algo, form.totalSteps)}</span>
        </div>
        {error && <p className="warn" role="status">{error}</p>}
      </form>
      <section className="panel" style={{ flex: "1 1 300px", minWidth: 0 }}>
        <h3>Aperçu du fichier YAML</h3>
        {yaml ? <pre style={{ overflow: "auto", maxHeight: 370 }} tabIndex={0}><code>{yaml}</code></pre>
          : <p className="note">Complétez les champs pour générer le YAML.</p>}
      </section>
    </div>
  );
}

function Progress({ rows, color }) {
  if (!rows.length) return <p className="note">La progression apparaît après la première évaluation.</p>;
  const points = rows.filter((row) => Number.isFinite(row.step) && Number.isFinite(row.lap_rate))
    .map((row) => ({ x: row.step, y: row.lap_rate }));
  const xTicks = [...new Set([points[0]?.x, points.at(-1)?.x])];
  return (
    <>
      <h4 className="card-title">Tours bouclés pendant l’entraînement</h4>
      {points.length > 0 ? <>
        <div style={{ maxWidth: 510 }}>
          <LineChart label="Tours bouclés" xLabel="Pas d’entraînement" xTicks={xTicks} descriptionId="training-progress-guide"
                     xFormat={(value) => COMPACT_STEPS.format(value)} yDomain={[0, 1]} yFormat={formatPercent}
                     tooltipXFormat={(value) => `${formatNumber(value)} pas`}
                     series={[{ name: "Tours bouclés", color, points }]} height={155} />
        </div>
        <details className="explanation">
          <summary>En savoir plus</summary>
          <p id="training-progress-guide">Chaque point indique la part des essais terminés par un tour complet lors d’une évaluation de l’agent.</p>
        </details>
      </> : <p className="note">Aucun taux de tours disponible pour les dernières évaluations.</p>}
      <details style={{ margin: "8px 0 16px" }}>
        <summary style={{ cursor: "pointer" }}>Détail des dernières évaluations</summary>
        <div style={{ overflowX: "auto" }} role="region" aria-label="Dernières évaluations" tabIndex={0}>
          <table aria-label="Valeurs des dernières évaluations">
            <thead><tr><th scope="col">Pas</th>{PROGRESS_FIELDS.map(([key, label]) => <th key={key} scope="col" className="num">{label}</th>)}</tr></thead>
            <tbody>{rows.slice().reverse().map((row) => (
              <tr key={row.step}>
                <th scope="row">{FORMAT.format(row.step)}</th>
                {PROGRESS_FIELDS.map(([key]) => <td key={key} className="num">
                  {Number.isFinite(row[key]) ? FORMAT.format(row[key] * (key === "lap_rate" ? 100 : 1)) : "—"}
                </td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </>
  );
}

function mergeCheckpoints(previous, incoming) {
  const files = new Map(previous.map((item) => [item.name, item]));
  for (const item of incoming) files.set(item.name, { ...files.get(item.name), ...item });
  return [...files.values()].sort((a, b) => b.step - a.step || a.name.localeCompare(b.name));
}

function RunMonitor({ run, mode, tracks }) {
  const id = run.run_id;
  const [state, setState] = useState(null);
  const [connection, setConnection] = useState("Connexion…");
  const [progress, setProgress] = useState([]);
  const [checkpoints, setCheckpoints] = useState([]);
  const [checkpoint, setCheckpoint] = useState("latest");
  const [watchTrack, setWatchTrack] = useState("");
  const [watchMu, setWatchMu] = useState("1");
  const [viewer, setViewer] = useState(null);
  const [watching, setWatching] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const [savedCondition, setSavedCondition] = useState(null);
  const socket = useRef(null);
  const watch = useRef(null);
  const selectedTrack = watchTrack || tracks.find(({ id }) => id === run.identity.trackId)?.id
    || tracks.find(({ split }) => split === "test")?.id || tracks[0]?.id;
  const watchMuValue = Number(watchMu);
  const muMode = id.includes("mualea") ? "uniform" : "fixed";
  const color = conditionColor(run.condition ?? savedCondition
    ?? (run.algo === "ppo" && muMode === "uniform" ? "ppo_mualea" : `${run.algo}_mufixe`));
  const hasSavedProgress = run.last_step != null || progress.length > 0;

  useEffect(() => {
    if (mode !== "server" || run.algo !== "ppo" || run.condition || muMode !== "fixed"
        || (!hasSavedProgress && run.state !== "finished")) return;
    let active = true;
    identifyCondition({ run_id: id, algo: run.algo, mu_mode: muMode }, mode).then(({ condition }) => {
      if (active) setSavedCondition(condition);
    });
    return () => { active = false; };
  }, [id, run.algo, run.condition, run.state, muMode, mode, hasSavedProgress]);

  useEffect(() => {
    let disposed = false;
    let reconnect;
    if (mode === "fixtures") {
      loadProgress(id).then((rows) => {
        if (!disposed) setProgress(rows.slice(-RECENT_ROWS));
      }).catch(() => { if (!disposed) setError("Impossible de charger la progression de cette fixture."); });
    }
    if (mode === "server") {
      listCheckpoints(id).then((files) => {
        if (!disposed) setCheckpoints((previous) => mergeCheckpoints(previous, files));
      }).catch((err) => { if (!disposed) setError(`Checkpoints indisponibles. ${err.message}`); });

      const connect = () => {
        const stream = openRunSocket(id);
        socket.current = stream;
        stream.onopen = () => { if (!disposed) setConnection("Connecté"); };
        stream.onmessage = ({ data }) => {
          if (disposed) return;
          const message = JSON.parse(data);
          switch (message.type) {
            case "status":
              setState(message.state);
              break;
            case "progress":
              setProgress((rows) => [...rows.filter((row) => row.step !== message.step), message]
                .sort((a, b) => a.step - b.step).slice(-RECENT_ROWS));
              break;
            case "checkpoint":
              setCheckpoints((files) => mergeCheckpoints(files, [{ name: message.name, step: message.step }]));
              break;
            case "frame":
              if (watch.current?.sent) {
                const frame = message;
                setViewer((session) => ({
                  ...session, frame, trail: [...session.trail, [frame.x, frame.y]], status: "Visionnage en cours",
                }));
              }
              break;
            case "episode_end":
              if (watch.current?.sent) {
                watch.current = null;
                setWatching(false);
                setViewer((session) => ({ ...session, status: OUTCOME_LABELS[message.summary.outcome] ?? "Épisode terminé" }));
              }
              break;
            case "error":
              setError(message.message);
              if (watch.current?.sent && !message.message.startsWith("Training failed.")) {
                if (stream.readyState === WebSocket.OPEN) stream.send(JSON.stringify({ type: "stop_watch" }));
                watch.current = null;
                setWatching(false);
                setViewer((session) => ({ ...session, status: "Visionnage interrompu" }));
              }
              break;
          }
        };
        stream.onclose = (event) => {
          if (disposed) return;
          socket.current = null;
          setState(null);
          if (watch.current) {
            watch.current = null;
            setWatching(false);
            setViewer((session) => ({ ...session, status: "Visionnage interrompu" }));
          }
          setConnection(event.code === 1008 ? "Connexion refusée" : "Déconnecté · reconnexion…");
          if (event.code !== 1008) reconnect = setTimeout(connect, 2000);
        };
      };
      connect();
    }
    return () => {
      disposed = true;
      clearTimeout(reconnect);
      watch.current = null;
      if (socket.current) {
        socket.current.close();
        socket.current = null;
      }
    };
  }, [id, mode]);

  async function stopTraining() {
    setStopping(true);
    setError("");
    try {
      const result = await stopRun(id);
      // Une fin peut déjà avoir été reçue par WebSocket au retour du POST.
      setState((current) => current === "finished" || current === "failed" ? current : result.state);
    } catch (err) {
      setError(err.message);
    } finally {
      setStopping(false);
    }
  }

  async function startWatching() {
    const stream = socket.current;
    if (stream?.readyState !== WebSocket.OPEN || watch.current) return;
    const session = { sent: false };
    watch.current = session;
    setWatching(true);
    setError("");
    setViewer({ track: null, trail: [], frame: null, status: "Chargement du circuit…" });
    try {
      const track = await loadTrack(selectedTrack);
      if (watch.current !== session || socket.current !== stream) return;
      stream.send(JSON.stringify({ type: "watch_live", checkpoint, track_id: selectedTrack, mu_factor: watchMuValue }));
      session.sent = true;
      setViewer({ track, trail: [], frame: null, status: "En attente des premières images…" });
    } catch (err) {
      if (watch.current !== session) return;
      setError(`Impossible de démarrer le visionnage. ${err.message}`);
      watch.current = null;
      setWatching(false);
      setViewer((current) => ({ ...current, status: "Visionnage interrompu" }));
    }
  }

  function stopWatching() {
    if (watch.current?.sent && socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ type: "stop_watch" }));
    }
    watch.current = null;
    setWatching(false);
    setViewer((session) => ({ ...session, status: "Visionnage arrêté" }));
  }

  const runState = state ?? run.state;
  const frame = viewer?.frame;
  return (
    <section className="card" aria-label="Suivi de l’entraînement sélectionné" style={{ minWidth: 0 }}>
      <div className="controls">
        <StateChip state={runState} />
        {mode === "server" && <span className="note" role="status">{connection}</span>}
        {mode === "server" && ["running", "stopping"].includes(runState) && (
          <button type="button" disabled={stopping || runState === "stopping"} onClick={stopTraining}>Arrêter</button>
        )}
      </div>
      {error && <p role="alert" className="warn">{error}</p>}
      <Progress rows={progress} color={color} />
      {mode === "server" && (
        <>
          <h4 className="card-title">Regarder l’agent conduire</h4>
          {checkpoints.length ? (
            <div className="controls">
              <label className="field">Sauvegarde de l’agent
                <select value={checkpoint} disabled={watching} onChange={(event) => setCheckpoint(event.target.value)}>
                  <option value="latest">Le plus récent</option>
                  {checkpoints.map((file) => <option key={file.name} value={file.name}>
                    Après {FORMAT.format(file.step)} pas
                  </option>)}
                </select>
              </label>
              <label className="field">Circuit
                <select value={selectedTrack ?? ""} disabled={watching} onChange={(event) => setWatchTrack(event.target.value)}>
                  <TrackOptions tracks={tracks} />
                </select>
              </label>
              <label className="field">Adhérence (μ)
                <input type="number" value={watchMu} min="0" step="any" disabled={watching}
                       list="watch-mu-options" onChange={(event) => setWatchMu(event.target.value)} />
                <datalist id="watch-mu-options">
                  {[1, 0.8, 0.6].map((mu) => <option key={mu} value={mu} label={muLabel(mu)} />)}
                </datalist>
              </label>
              <button type="button" onClick={startWatching}
                      disabled={watching || connection !== "Connecté" || !selectedTrack || !(watchMuValue > 0 && Number.isFinite(watchMuValue))}>
                Regarder l’agent conduire
              </button>
              {watching && <button type="button" onClick={stopWatching}>Arrêter le visionnage</button>}
            </div>
          ) : <p className="note">Le visionnage sera disponible après la première sauvegarde de l’agent.</p>}
          {viewer && <p className="note">
            <span role="status">{viewer.status}</span>
            {frame && ` · ${FORMAT.format(frame.t)} s · ${FORMAT.format(frame.v * 3.6)} km/h`}
          </p>}
          {viewer?.track && (
            <TrackCanvas track={viewer.track} height={300}
                         cars={frame ? [{ ...frame, color }] : []}
                         trails={[{ points: viewer.trail, color }]}
                         rays={frame ? { x: frame.x, y: frame.y, psi: frame.psi, distances: frame.sensors_m } : null} />
          )}
        </>
      )}
      {mode === "fixtures" && <p className="note">Le visionnage en direct nécessite le serveur d’entraînement.</p>}
    </section>
  );
}

export default function TrainingCenter({ mode }) {
  const [tracks, setTracks] = useState([]);
  const [runs, setRuns] = useState([]);
  const [form, setForm] = useState(TRAINING_DEFAULTS);
  const [preset, setPreset] = useState("quick");
  const [selected, setSelected] = useState("");
  const [launchedRun, setLaunchedRun] = useState(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [tracksError, setTracksError] = useState("");

  useEffect(() => {
    let active = true;
    listTracks().then((items) => {
      if (!active) return;
      setTracks(items);
      const demo = items.find((track) => track.split === "demo");
      const train = demo ?? items.find((track) => track.split === "train") ?? items[0];
      const test = demo ?? items.find((track) => track.split === "test");
      setForm((current) => ({ ...current, trainTracks: train ? [train.id] : [], testTracks: test ? [test.id] : [] }));
    }).catch(() => { if (active) setTracksError("Impossible de charger la liste des circuits."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!mode) return;
    let active = true;
    let timer;
    async function refresh() {
      try {
        const items = await listRuns();
        if (active) {
          setRuns(items);
          setListError("");
        }
      } catch {
        if (active) setListError("Impossible de rafraîchir la liste des entraînements.");
      } finally {
        if (active && mode === "server") timer = setTimeout(refresh, 4000);
      }
    }
    refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [mode]);

  const { yaml, validation } = useMemo(() => {
    try {
      return { yaml: buildTrainingYaml(form), validation: "" };
    } catch (err) {
      return { yaml: "", validation: err.message };
    }
  }, [form]);
  const simpleForm = useMemo(() => presetForm(preset, tracks), [preset, tracks]);

  const available = runs.map((run) => run.run_id === launchedRun?.run_id ? { ...launchedRun, ...run } : run);
  if (launchedRun && !available.some(({ run_id }) => run_id === launchedRun.run_id)) available.push(launchedRun);
  const entries = available.map((run) => ({ ...run, identity: runIdentity(run, tracks) }))
    .sort((a, b) => (b.identity.date?.getTime() ?? 0) - (a.identity.date?.getTime() ?? 0) || b.run_id.localeCompare(a.run_id));
  const run = entries.find((item) => item.run_id === selected) ?? entries[0];

  async function launch(config) {
    if (mode !== "server" || launching || !config) return;
    setLaunching(true);
    setError("");
    try {
      const result = await startRun(buildTrainingYaml(config));
      const { algo, muMode, reward, seed, trainTracks } = config;
      const condition = algo === "ppo" && muMode === "fixed" && Number(reward.lambda_steer) === 0
        ? "ppo_mufixe_nolambda" : null;
      setLaunchedRun({ ...result, algo, seed: Number(seed), trainTracks, condition });
      setSelected(result.run_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div className="stack">
      <header className="page-header training-header">
        <h2>Centre d’entraînement</h2>
        <p>Lancez un nouvel entraînement depuis le navigateur, suivez-le en direct, puis regardez l’agent conduire.</p>
      </header>
      {tracksError && <p className="warn" role="alert">{tracksError}</p>}
      <section className="card" aria-labelledby="presets-title">
        <h3 className="card-title" id="presets-title">Choisir un entraînement</h3>
        <div className="grid-3" role="group" aria-label="Préréglages"
             style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 215px), 1fr))" }}>
          {PRESETS.map(({ id, title, algo, steps, circuit }) => (
            <button type="button" key={id} className={id === preset ? "on" : ""} aria-pressed={id === preset}
                    onClick={() => setPreset(id)} style={{ textAlign: "left", padding: "13px 15px" }}>
              <strong style={{ display: "block" }}>{title}</strong>
              <span style={{ display: "block", marginBlock: 4 }}>{circuit && `${ALGO_LABELS[algo]} · `}
                {formatNumber(steps)} pas {circuit}</span>
              <span className="note">{estimateDuration(algo, steps)}</span>
            </button>
          ))}
        </div>
        <div className="controls" style={{ marginBottom: 0 }}>
          <button type="button" className="primary" disabled={mode !== "server" || launching || !simpleForm}
                  onClick={() => launch(simpleForm)}>{launching ? "Lancement…" : "Lancer"}</button>
          {mode === "fixtures" && <span className="note">Le serveur d’entraînement est absent. Le lancement est désactivé avec les données d’exemple.</span>}
          {mode === "server" && tracks.length > 0 && !simpleForm && <span className="note">Les circuits de ce préréglage sont indisponibles.</span>}
        </div>
        <details className="explanation">
          <summary>En savoir plus sur la durée</summary>
          <p>Un pas correspond à une décision de l’agent. La durée est estimée d’après le débit mesuré et varie selon la machine et les évaluations.</p>
        </details>
      </section>
      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 650 }}>Avancé</summary>
        <ConfigForm form={form} setForm={setForm} tracks={tracks} yaml={yaml} error={validation}
                    onSubmit={(event) => { event.preventDefault(); launch(form); }} launching={launching} mode={mode} />
      </details>
      {error && <p className="warn" role="alert">{error}</p>}
      <section aria-labelledby="runs-title">
        <h3 className="card-title" id="runs-title">Suivi des entraînements</h3>
        {listError && <p className="warn" role="alert">{listError}</p>}
        {run ? (
          <div className="row">
            <div className="card" style={{ flex: "1 1 290px", minWidth: 0 }}>
              <h4 className="card-title">Entraînements récents</h4>
              <div className="stack" style={{ maxHeight: 370, overflowY: "auto", gap: 6 }}>
                {entries.map((item) => (
                  <button key={item.run_id} type="button" title={item.run_id}
                          className={run.run_id === item.run_id ? "on" : ""} aria-pressed={run.run_id === item.run_id}
                          onClick={() => setSelected(item.run_id)} style={{ textAlign: "left", paddingBlock: 8 }}>
                    <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "space-between" }}>
                      <strong>{item.identity.algo} · {item.identity.circuits}</strong>
                      <StateChip state={item.state} />
                    </span>
                    <span className="note" style={{ display: "block" }}>
                      {item.identity.date ? DATE_FORMAT.format(item.identity.date) : "Date non renseignée"}
                      {Number.isFinite(item.seed) && ` · Graine ${formatNumber(item.seed)}`}
                      {Number.isFinite(item.last_step ?? item.step) && ` · ${formatNumber(item.last_step ?? item.step)} pas`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: "2 1 470px", minWidth: 0 }}>
              <RunMonitor key={run.run_id} run={run} mode={mode} tracks={tracks} />
            </div>
          </div>
        ) : <p className="empty">Aucun entraînement disponible.</p>}
      </section>
    </div>
  );
}
