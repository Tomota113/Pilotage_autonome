// Accès aux fichiers du contrat de données.
//
// Mode « server » : le serveur FastAPI (uvicorn server.app:app) sert les fichiers réels
// (/files/tracks, /files/runs, /files/results) et l'API du Training Center.
// Mode « fixtures » : serveur absent ; l'application lit app/public/fixtures/fixture_*.json,
// des données de développement FACTICES, signalées « FIXTURE » à l'écran et jamais montrées en démo.

import { parseCSV } from "./csv.js";

const FIXTURES = "/fixtures/";
let modePromise = null;

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} : ${res.status}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} : ${res.status}`);
  return res.text();
}

export function getMode() {
  modePromise ??= fetch("/runs")
    .then((res) => (res.ok && (res.headers.get("content-type") ?? "").includes("json") ? "server" : "fixtures"))
    .catch(() => "fixtures");
  return modePromise;
}

let manifestPromise = null;
const manifest = () => (manifestPromise ??= fetchJSON(`${FIXTURES}fixture_manifest.json`));

export async function listTracks() {
  if ((await getMode()) === "fixtures") return (await manifest()).tracks;
  return fetchJSON("/tracks");
}

export async function loadTrack(id) {
  if ((await getMode()) === "fixtures") {
    const entry = (await manifest()).tracks.find((t) => t.id === id);
    return fetchJSON(FIXTURES + entry.file);
  }
  return fetchJSON(`/files/tracks/${encodeURIComponent(id)}.json`);
}

export async function loadEval() {
  if ((await getMode()) === "fixtures") return fetchJSON(FIXTURES + (await manifest()).eval);
  try {
    return parseCSV(await fetchText("/files/results/eval.csv"));
  } catch {
    return []; // pas encore d'évaluation
  }
}

// Replays disponibles : lignes de eval.csv qui ont un replay_path.
export async function listReplays() {
  if ((await getMode()) === "fixtures") return (await manifest()).replays;
  return (await loadEval())
    .filter((r) => r.replay_path)
    .map((r) => ({ path: r.replay_path, run_id: r.run_id, algo: r.algo, track_id: r.track_id,
                   mu_factor: r.mu_factor, outcome: r.outcome, lap_time: r.lap_time }));
}

export async function loadReplay(path) {
  if ((await getMode()) === "fixtures") return fetchJSON(FIXTURES + path);
  return fetchJSON(`/files/${path}`); // replay_path = "runs/<run_id>/replays/<fichier>.json"
}

export async function listRuns() {
  if ((await getMode()) === "fixtures") return (await manifest()).runs;
  return fetchJSON("/runs");
}

export async function loadProgress(runId) {
  if ((await getMode()) === "fixtures") {
    const file = (await manifest()).progress[runId];
    return file ? fetchJSON(FIXTURES + file) : [];
  }
  try {
    return parseCSV(await fetchText(`/files/runs/${encodeURIComponent(runId)}/progress.csv`));
  } catch {
    return [];
  }
}

export async function startRun(yamlText) {
  const response = await fetch("/runs", {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: yamlText,
  });
  if (!response.ok) {
    const { detail } = await response.json().catch(() => ({}));
    throw new Error(detail ?? `Lancement refusé (HTTP ${response.status}).`);
  }
  return response.json();
}

export async function stopRun(id) {
  const response = await fetch(`/runs/${encodeURIComponent(id)}/stop`, { method: "POST" });
  if (!response.ok) {
    const { detail } = await response.json().catch(() => ({}));
    throw new Error(detail ?? `Arrêt refusé (HTTP ${response.status}).`);
  }
  return response.json();
}

export function listCheckpoints(id) {
  return fetchJSON(`/runs/${encodeURIComponent(id)}/checkpoints`);
}

export function openRunSocket(id) {
  const url = new URL(`/ws/runs/${encodeURIComponent(id)}`, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(url);
}
