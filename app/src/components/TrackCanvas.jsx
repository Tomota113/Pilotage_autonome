// Dessin d'un circuit en Canvas 2D, avec voitures, trajectoires et rayons des capteurs.
// `draw(ctx, view)` permet à une page d'ajouter ses propres éléments ; `onPointer`
// reçoit les événements souris avec leur position en mètres (Track Designer).
import { useEffect, useMemo, useRef } from "react";
import { bounds, fitView, SENSOR_ANGLES_DEG, trackBorders } from "../data/geometry.js";

const CAR_LENGTH = 5; // m

function path(ctx, pts, view, close) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = view.toScreen(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (close) ctx.closePath();
}

export function drawCar(ctx, view, { x, y, psi, color }) {
  const [sx, sy] = view.toScreen([x, y]);
  const len = Math.max(12, CAR_LENGTH * view.scale);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-psi); // y écran vers le bas : angle inversé
  ctx.fillStyle = color;
  ctx.strokeStyle = "#151514";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(len / 2, 0);
  ctx.lineTo(-len / 2, len / 3);
  ctx.lineTo(-len / 2, -len / 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export default function TrackCanvas({ track, cars = [], trails = [], rays = null, draw = null, onPointer = null,
                                      height = 520, extraPoints = [] }) {
  const ref = useRef(null);
  const geom = useMemo(() => (track ? trackBorders(track) : null), [track]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !geom) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const view = fitView(bounds([...geom.left, ...geom.right, ...extraPoints], 10), width, height);
    canvas._view = view;

    // Piste : surface entre les deux bords, puis les bords
    ctx.fillStyle = "#2b2b29";
    path(ctx, geom.left, view, true);
    ctx.fill();
    ctx.fillStyle = "#151514";
    path(ctx, geom.right, view, true);
    ctx.fill();
    ctx.strokeStyle = "#8c8b84";
    ctx.lineWidth = 1.5;
    path(ctx, geom.left, view, true);
    ctx.stroke();
    path(ctx, geom.right, view, true);
    ctx.stroke();
    // Ligne de départ et checkpoints
    track.checkpoints.forEach((ci, k) => {
      const a = view.toScreen(geom.left[ci]);
      const b = view.toScreen(geom.right[ci]);
      ctx.strokeStyle = k === 0 ? "#f0efec" : "#4a4a46";
      ctx.lineWidth = k === 0 ? 3 : 1;
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.lineTo(...b);
      ctx.stroke();
    });

    for (const t of trails) {
      if (t.points.length < 2) continue;
      ctx.strokeStyle = t.color;
      ctx.globalAlpha = t.alpha ?? 0.8;
      ctx.lineWidth = 2;
      path(ctx, t.points, view, false);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (rays) {
      ctx.strokeStyle = "#fab219aa";
      ctx.lineWidth = 1;
      SENSOR_ANGLES_DEG.forEach((deg, k) => {
        const a = rays.psi + (deg * Math.PI) / 180;
        const d = rays.distances[k];
        ctx.beginPath();
        ctx.moveTo(...view.toScreen([rays.x, rays.y]));
        ctx.lineTo(...view.toScreen([rays.x + d * Math.cos(a), rays.y + d * Math.sin(a)]));
        ctx.stroke();
      });
    }
    cars.forEach((c) => drawCar(ctx, view, c));
    if (draw) draw(ctx, view);
  });

  const handler = (type) => (e) => {
    if (!onPointer || !ref.current?._view) return;
    const r = ref.current.getBoundingClientRect();
    onPointer(type, ref.current._view.toWorld([e.clientX - r.left, e.clientY - r.top]), e, ref.current._view);
  };

  if (!track) return <div className="empty">Aucun circuit chargé.</div>;
  return (
    <canvas ref={ref} style={{ height }} onPointerDown={handler("down")} onPointerMove={handler("move")}
            onPointerUp={handler("up")} />
  );
}
