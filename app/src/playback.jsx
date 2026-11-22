// État de lecture partagé : le replay choisi dans le Race Simulator reste affiché, à la même
// image, dans le Neural Network Explorer (les deux modules sont synchronisés).
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { loadReplay, loadTrack } from "./data/api.js";
import { frameIndexAt, interpolateFrame } from "./data/interpolate.js";

const PlaybackContext = createContext(null);
export const SPEEDS = [0.5, 1, 2, 4, 8];
const READOUT_UPDATE_MS = 65;

export function PlaybackProvider({ children }) {
  const [entry, setEntry] = useState(null); // ligne de la liste des replays
  const [replay, setReplay] = useState(null);
  const [track, setTrack] = useState(null);
  const [error, setError] = useState(null);
  const [index, setFrameIndex] = useState(0);
  const [playing, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const time = useRef(0);
  const selection = useRef(0);

  const select = useCallback(async (e) => {
    const id = ++selection.current;
    setRunning(false);
    setEntry(e);
    setReplay(null);
    setTrack(null);
    setError(null);
    try {
      const r = await loadReplay(e.path);
      if (id !== selection.current) return;
      const t = await loadTrack(r.track_id);
      if (id !== selection.current) return;
      time.current = 0;
      setFrameIndex(0);
      setReplay(r);
      setTrack(t);
    } catch (err) {
      if (id === selection.current) setError(String(err));
    }
  }, []);

  const setIndex = useCallback((next) => {
    time.current = replay.frames[next].t;
    setFrameIndex(next);
  }, [replay]);
  const setPlaying = useCallback((next) => {
    if (!next && replay) setFrameIndex(frameIndexAt(replay.frames, time.current));
    setRunning(next);
  }, [replay]);
  const getTime = useCallback(() => time.current, []);
  const getFrame = useCallback(() => interpolateFrame(replay.frames, time.current), [replay]);

  // Horloge : en lecture, le temps du replay avance de (temps réel × vitesse)
  useEffect(() => {
    if (!playing || !replay) return undefined;
    let raf, last = null, lastUpdate = -Infinity;
    const frames = replay.frames;
    const end = frames.at(-1).t;
    let previousIndex = frameIndexAt(frames, time.current);
    const tick = (now) => {
      if (last !== null) time.current = Math.min(end, time.current + ((now - last) / 1000) * speed);
      last = now;
      const nextIndex = frameIndexAt(frames, time.current);
      // Le canvas suit l'horloge interpolée ; les instruments React ont leur propre cadence.
      if (nextIndex !== previousIndex && (now - lastUpdate >= READOUT_UPDATE_MS || time.current >= end
          || frames[nextIndex].off_track !== frames[previousIndex].off_track)) {
        lastUpdate = now;
        previousIndex = nextIndex;
        setFrameIndex(nextIndex);
      }
      if (time.current >= end) setRunning(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, replay]);

  const value = { entry, replay, track, error, index, setIndex, getTime, getFrame, playing, setPlaying, speed, setSpeed, select };
  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

export const usePlayback = () => useContext(PlaybackContext);

export function PlaybackControls({ broadcast = false }) {
  const { replay, index, setIndex, playing, setPlaying, speed, setSpeed } = usePlayback();
  if (!replay) return null;
  const last = replay.frames.length - 1;
  return (
    <div className={broadcast ? "controls broadcast-playback" : "controls"}>
      <button className={broadcast ? "primary" : undefined} onClick={() => { if (index >= last) setIndex(0); setPlaying(!playing); }}>
        {playing ? "Pause" : "Lecture"}
      </button>
      {SPEEDS.map((s) => (
        <button key={s} className={s === speed ? "on" : ""} aria-pressed={s === speed} onClick={() => setSpeed(s)}>×{s}</button>
      ))}
      <input type="range" min={0} max={last} value={index} style={broadcast ? undefined : { flex: 1, minWidth: 160 }}
             onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)); }} aria-label="Curseur temporel" />
      <span className="note playback-time">{replay.frames[index].t.toFixed(2)} s / {replay.frames[last].t.toFixed(2)} s</span>
    </div>
  );
}
