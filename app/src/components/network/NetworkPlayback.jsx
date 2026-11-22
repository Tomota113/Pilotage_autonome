import { useEffect } from "react";
import { PlaybackControls, usePlayback } from "../../playback.jsx";

export default function NetworkPlayback() {
  const { replay, index, setIndex, playing, setPlaying } = usePlayback();
  const last = (replay?.frames.length ?? 0) - 1;

  useEffect(() => {
    if (last < 1) return undefined;
    function onSpace(event) {
      if (event.code !== "Space" || event.repeat || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target.closest?.("button:not([data-network-step]), input, select, textarea, a, summary, [contenteditable], [role=button]")) return;
      event.preventDefault();
      if (!playing && index >= last) setIndex(0);
      setPlaying(!playing);
    }
    window.addEventListener("keydown", onSpace);
    return () => window.removeEventListener("keydown", onSpace);
  }, [index, last, playing, setIndex, setPlaying]);

  if (!replay) return null;

  function step(offset) {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(last, index + offset)));
  }

  return <section className="network-playback" aria-label="Lecture pas à pas">
    <div className="network-steps">
      <button type="button" data-network-step disabled={index <= 0} onClick={() => step(-1)}>← Image précédente</button>
      <button type="button" data-network-step disabled={index >= last} onClick={() => step(1)}>Image suivante →</button>
      <span className="network-number">Image {index + 1} / {last + 1}</span>
      <span className="network-key-hint"><kbd>Espace</kbd> Lecture / pause</span>
    </div>
    <PlaybackControls />
  </section>;
}
