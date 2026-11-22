import { useEffect, useMemo, useState } from "react";
import { loadRaceline } from "../data/api.js";
import { isF1Track } from "../data/f1.js";
import { addPath, applyWorldTransform } from "./race/trackArtwork.js";

export function useRacelineOverlay(trackId, mu, car, loadWhenHidden = false) {
  const [preference, setPreference] = useState(null);
  const [result, setResult] = useState(null);
  const checked = preference && preference.trackId === trackId ? preference.checked : isF1Track(trackId);
  const enabled = Boolean(trackId) && mu != null && (checked || loadWhenHidden);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadRaceline(trackId, mu, car).then((line) => {
      if (active) setResult({ trackId, mu, car, line });
    }).catch(() => {
      if (active) setResult({ trackId, mu, car, line: null });
    });
    return () => { active = false; };
  }, [enabled, trackId, mu, car]);

  const current = result?.trackId === trackId && result?.mu === mu && result?.car === car ? result : null;
  const line = current?.line;
  const path = useMemo(() => {
    if (!(line?.points?.length > 1) || typeof Path2D !== "function") return null;
    const result = new Path2D();
    addPath(result, line.points, true);
    return result;
  }, [line]);
  const draw = checked && path ? (ctx, view) => {
    ctx.save();
    applyWorldTransform(ctx, view);
    ctx.strokeStyle = "#f4f9d9d4";
    ctx.lineWidth = 1.35 / view.scale;
    ctx.lineCap = "butt";
    ctx.setLineDash([5 / view.scale, 4 / view.scale]);
    ctx.stroke(path);
    ctx.restore();
  } : null;

  return { checked, setChecked: (value) => setPreference({ trackId, checked: value }), line, draw, unavailable: current && !line };
}

export function RacelineToggle({ checked, setChecked, unavailable }) {
  return <>
    <label className="note"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /> Trajectoire idéale</label>
    {checked && unavailable && <span className="note" role="status">Trajectoire idéale indisponible.</span>}
  </>;
}
