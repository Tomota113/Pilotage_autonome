import { useEffect, useMemo, useRef, useState } from "react";
import TrackCanvas from "../components/TrackCanvas.jsx";
import { listCheckpoints, listRuns, listTracks, loadProgress, loadTrack, openRunSocket, startRun, stopRun } from "../data/api.js";
import { ACTION_SPACES, buildTrainingYaml, TRAINING_DEFAULTS } from "../data/yaml.js";

const ALGO_LABELS = { ppo: "PPO", dqn: "DQN", sac: "SAC", qlearning: "Q-Learning" };
const STATES = { running: "En cours", stopping: "Arrêt en cours", finished: "Terminé", failed: "Échec" };
const OUTCOMES = { lap: "Tour validé", off_track: "Sortie de piste", stalled: "Progression interrompue", timeout: "Temps écoulé" };
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
const RECENT_ROWS = 30;
const CAR_COLOR = "#3987e5";

function NumberField({ label, value, onChange, min = 0, step = "any" }) {
  return (
    <label className="module-field">{label}
      <input type="number" min={min} step={step} required value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TrackOptions({ tracks }) {
  return tracks.map(({ id, name, split }) => <option key={id} value={id}>{name} ({split})</option>);
}

function ConfigForm({ form, setForm, tracks, yaml, error, onSubmit, launching, mode }) {
  const field = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const number = (key, label, min, step) =>
    <NumberField label={label} value={form[key]} min={min} step={step} onChange={(value) => field(key, value)} />;
  function trackSelect(key, label) {
    return (
      <label className="module-field">{label}
        <select multiple size="4" value={form[key]}
                onChange={(event) => field(key, Array.from(event.target.selectedOptions, (option) => option.value))}>
          <TrackOptions tracks={tracks} />
        </select>
      </label>
    );
  }
  return (
    <div className="row training-config">
      <form className="panel grow" onSubmit={onSubmit}>
        <h3>Configuration de l’entraînement</h3>
        <div className="module-fields">
          <label className="module-field">Algorithme
            <select value={form.algo} onChange={(event) => field("algo", event.target.value)}>
              {Object.entries(ALGO_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="module-field">Espace d’actions
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
            <label className="module-field">Mode de μ
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
            {number("checkpointEvery", "Checkpoint tous les N pas", 1, 1)}
            {number("evalEvery", "Évaluation tous les N pas", 1, 1)}
            {number("evalEpisodes", "Épisodes par évaluation", 1, 1)}
          </div>
        </fieldset>
        <div className="controls">
          <button type="submit" className="on" disabled={mode !== "server" || !yaml || launching}>
            {launching ? "Lancement…" : "Lancer"}
          </button>
          {mode === "fixtures" && <span className="warn">Serveur absent. Le lancement est désactivé en mode fixtures.</span>}
        </div>
        {error && <p className="warn" role="status">{error}</p>}
      </form>
      <section className="panel grow">
        <h3>Aperçu de config.yaml</h3>
        {yaml ? <pre className="yaml-preview" tabIndex={0}><code>{yaml}</code></pre>
          : <p className="note">Complétez les champs pour générer le YAML.</p>}
      </section>
    </div>
  );
}

function Progress({ rows }) {
  if (!rows.length) return <p className="note">Aucune ligne de progression disponible.</p>;
  const values = rows.filter((row) => Number.isFinite(row.mean_reward));
  const low = Math.min(...values.map((row) => row.mean_reward));
  const high = Math.max(...values.map((row) => row.mean_reward));
  const first = values[0]?.step;
  const last = values.at(-1)?.step;
  const x = (step) => first === last ? 230 : 55 + 350 * (step - first) / (last - first);
  const y = (value) => high === low ? 52 : 90 - 76 * (value - low) / (high - low);
  return (
    <>
      <h4>Dernières évaluations</h4>
      {values.length > 0 && (
        <svg className="module-chart training-chart" viewBox="0 0 460 125" role="img" aria-label="Récompense moyenne par pas d’entraînement">
          <path d="M55 14V90H405" fill="none" stroke="var(--line)" />
          <text x="47" y={y(high)} dy=".35em" textAnchor="end">{FORMAT.format(high)}</text>
          {low !== high && <text x="47" y="94" textAnchor="end">{FORMAT.format(low)}</text>}
          <text x={x(first)} y="108" textAnchor="middle">{FORMAT.format(first)}</text>
          {last !== first && <text x={x(last)} y="108" textAnchor="middle">{FORMAT.format(last)}</text>}
          <text x="230" y="124" textAnchor="middle">Pas d’entraînement</text>
          <polyline points={values.map((row) => `${x(row.step)},${y(row.mean_reward)}`).join(" ")}
                    fill="none" stroke={CAR_COLOR} strokeWidth="2" />
          {values.map(({ step, mean_reward: reward }) => (
            <circle key={step} cx={x(step)} cy={y(reward)} r="3" fill={CAR_COLOR}>
              <title>{`${FORMAT.format(step)} pas · récompense ${FORMAT.format(reward)}`}</title>
            </circle>
          ))}
        </svg>
      )}
      <div className="module-table" role="region" aria-label="Dernières évaluations" tabIndex={0}>
        <table aria-label="Valeurs des dernières évaluations">
          <thead><tr><th scope="col">Pas</th>{PROGRESS_FIELDS.map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead>
          <tbody>{rows.slice().reverse().map((row) => (
            <tr key={row.step}>
              <th scope="row">{FORMAT.format(row.step)}</th>
              {PROGRESS_FIELDS.map(([key]) => <td key={key}>
                {Number.isFinite(row[key]) ? FORMAT.format(row[key] * (key === "lap_rate" ? 100 : 1)) : "—"}
              </td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
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
  const socket = useRef(null);
  const watch = useRef(null);
  const selectedTrack = watchTrack || tracks[0]?.id;
  const watchMuValue = Number(watchMu);

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
                setViewer((session) => ({ ...session, status: OUTCOMES[message.summary.outcome] ?? "Épisode terminé" }));
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
    <section className="panel module-section">
      <div className="controls">
        <strong>État · {STATES[runState] ?? "Inconnu"}</strong>
        {mode === "server" && <span className="note" role="status">{connection}</span>}
        {mode === "server" && ["running", "stopping"].includes(runState) && (
          <button type="button" disabled={stopping || runState === "stopping"} onClick={stopTraining}>Arrêter</button>
        )}
      </div>
      {error && <p role="alert" className="warn">{error}</p>}
      <Progress rows={progress} />
      {mode === "server" && (
        <>
          <h4>Checkpoints</h4>
          {checkpoints.length ? (
            <div className="controls">
              <label className="module-field">Checkpoint
                <select value={checkpoint} disabled={watching} onChange={(event) => setCheckpoint(event.target.value)}>
                  <option value="latest">Le plus récent</option>
                  {checkpoints.map((file) => <option key={file.name} value={file.name}>
                    {file.name} ({FORMAT.format(file.step)} pas)
                  </option>)}
                </select>
              </label>
              <label className="module-field">Circuit du visionnage
                <select value={selectedTrack ?? ""} disabled={watching} onChange={(event) => setWatchTrack(event.target.value)}>
                  <TrackOptions tracks={tracks} />
                </select>
              </label>
              <label className="module-field">Facteur μ du visionnage
                <input type="number" value={watchMu} min="0" step="any" disabled={watching}
                       onChange={(event) => setWatchMu(event.target.value)} />
              </label>
              <button type="button" onClick={startWatching}
                      disabled={watching || connection !== "Connecté" || !selectedTrack || !(watchMuValue > 0 && Number.isFinite(watchMuValue))}>
                Regarder en direct
              </button>
              {watching && <button type="button" onClick={stopWatching}>Arrêter le visionnage</button>}
            </div>
          ) : <p className="note">Aucun checkpoint disponible.</p>}
          {viewer && <p className="note">
            <span role="status">{viewer.status}</span>
            {frame && ` · ${FORMAT.format(frame.t)} s · ${FORMAT.format(frame.v * 3.6)} km/h`}
          </p>}
          {viewer?.track && (
            <TrackCanvas track={viewer.track} height={400} label="Aperçu du circuit et de l’agent pendant le visionnage"
                         cars={frame ? [{ ...frame, color: CAR_COLOR }] : []}
                         trails={[{ points: viewer.trail, color: CAR_COLOR }]}
                         rays={frame ? { x: frame.x, y: frame.y, psi: frame.psi, distances: frame.sensors_m } : null} />
          )}
        </>
      )}
    </section>
  );
}

export default function TrainingCenter({ mode }) {
  const [tracks, setTracks] = useState([]);
  const [runs, setRuns] = useState([]);
  const [form, setForm] = useState(TRAINING_DEFAULTS);
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
          setRuns(items.slice().reverse());
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

  const available = launchedRun && !runs.some((run) => run.run_id === launchedRun.run_id) ? [launchedRun, ...runs] : runs;
  const run = available.find((item) => item.run_id === selected) ?? available[0];

  async function launch(event) {
    event.preventDefault();
    if (mode !== "server" || launching || !yaml) return;
    setLaunching(true);
    setError("");
    try {
      const result = await startRun(yaml);
      setLaunchedRun({ ...result, algo: form.algo, seed: form.seed });
      setSelected(result.run_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLaunching(false);
    }
  }

  return (
    <>
      <h2>Centre d’entraînement</h2>
      {tracksError && <p className="warn" role="alert">{tracksError}</p>}
      <ConfigForm form={form} setForm={setForm} tracks={tracks} yaml={yaml} error={validation}
                  onSubmit={launch} launching={launching} mode={mode} />
      {error && <p className="warn" role="alert">{error}</p>}
      <h3>Suivi des entraînements</h3>
      {listError && <p className="warn" role="alert">{listError}</p>}
      {run ? (
        <>
          <div className="controls">
            <label className="module-field run-picker">Entraînement
              <select value={run.run_id} onChange={(event) => setSelected(event.target.value)}>
                {available.map((item) => <option key={item.run_id} value={item.run_id}>
                  {item.run_id} · {STATES[item.state] ?? "État inconnu"}
                </option>)}
              </select>
            </label>
          </div>
          <RunMonitor key={run.run_id} run={run} mode={mode} tracks={tracks} />
        </>
      ) : <p className="empty">Aucun entraînement disponible.</p>}
    </>
  );
}
