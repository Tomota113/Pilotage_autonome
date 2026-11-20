// État de lecture partagé : le replay choisi dans le Race Simulator reste affiché, à la même
// image, dans le Neural Network Explorer (les deux modules sont synchronisés).
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { loadReplay, loadTrack } from "./data/api.js";

const PlaybackContext = createContext(null);
export const SPEEDS = [0.5, 1, 2, 4, 8];

export function PlaybackProvider({ children }) {
  const [entry, setEntry] = useState(null); // ligne de la liste des replays
  const [replay, setReplay] = useState(null);
  const [track, setTrack] = useState(null);
  const [error, setError] = useState(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const clock = useRef({ last: null, t: 0 });

  const select = useCallback(async (e) => {
    setPlaying(false);
    setEntry(e);
    setError(null);
    try {
      const r = await loadReplay(e.path);
      const t = await loadTrack(r.track_id);
      clock.current.t = 0;
      setIndex(0);
      setReplay(r);
      setTrack(t);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  // Horloge : en lecture, le temps du replay avance de (temps réel × vitesse)
  useEffect(() => {
    if (!playing || !replay) return undefined;
    let raf;
    clock.current.last = null;
    clock.current.t = index * replay.dt;
    const tick = (now) => {
      const c = clock.current;
      if (c.last !== null) c.t += ((now - c.last) / 1000) * speed;
      c.last = now;
      const i = Math.min(replay.frames.length - 1, Math.floor(c.t / replay.dt));
      setIndex(i);
      if (i >= replay.frames.length - 1) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // index volontairement absent : il est piloté par l'horloge pendant la lecture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, replay]);

  const value = { entry, replay, track, error, index, setIndex, playing, setPlaying, speed, setSpeed, select };
  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

export const usePlayback = () => useContext(PlaybackContext);

export function PlaybackControls() {
  const { replay, index, setIndex, playing, setPlaying, speed, setSpeed } = usePlayback();
  if (!replay) return null;
  const last = replay.frames.length - 1;
  return (
    <div className="controls">
      <button onClick={() => { if (index >= last) setIndex(0); setPlaying(!playing); }}>
        {playing ? "Pause" : "Lecture"}
      </button>
      {SPEEDS.map((s) => (
        <button key={s} className={s === speed ? "on" : ""} onClick={() => setSpeed(s)}>×{s}</button>
      ))}
      <input type="range" min={0} max={last} value={index} style={{ flex: 1, minWidth: 160 }}
             onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)); }} aria-label="Curseur temporel" />
      <span className="note">{replay.frames[index].t.toFixed(2)} s / {replay.frames[last].t.toFixed(2)} s</span>
    </div>
  );
}
