import { useEffect, useState } from "react";
import { loadRaceline } from "../data/api.js";
import { isF1Track } from "../data/f1.js";

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
  const points = line?.points;
  const draw = checked && points?.length > 1 ? (ctx, view) => {
    ctx.save();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.25;
    ctx.lineCap = "butt";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(...view.toScreen(points[0]));
    for (let i = 1; i < points.length; i++) ctx.lineTo(...view.toScreen(points[i]));
    ctx.closePath();
    ctx.stroke();
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
