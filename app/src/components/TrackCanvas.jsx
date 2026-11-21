// Dessin d'un circuit en Canvas 2D : piste, vibreurs, ligne d'arrivée, voitures, trajectoires
// (colorées selon la vitesse si `speeds` est fourni) et rayons des capteurs.
// Navigation : molette = zoom autour du curseur, glisser = déplacer (Maj + glisser quand la page
// édite la piste avec `onPointer`), boutons + / − / recentrer / suivre la voiture.
// `draw(ctx, view)` ajoute des éléments ; `onPointer(type, [x, y], event, view)` reçoit la souris en mètres.
import { useEffect, useMemo, useRef, useState } from "react";
import { bounds, SENSOR_ANGLES_DEG, trackBorders } from "../data/geometry.js";

const CAR_LENGTH = 5.5; // m
const KERB_CURVATURE = 1 / 90; // vibreurs dans les virages de rayon < 90 m

function curvatures(points) {
  const n = points.length;
  return points.map((_, i) => {
    const [ax, ay] = points[(i - 1 + n) % n];
    const [bx, by] = points[i];
    const [cx, cy] = points[(i + 1) % n];
    const h1 = Math.atan2(by - ay, bx - ax);
    const h2 = Math.atan2(cy - by, cx - bx);
    const turn = Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1));
    return turn / (0.5 * (Math.hypot(bx - ax, by - ay) + Math.hypot(cx - bx, cy - by)));
  });
}

// Couleur d'une vitesse : bleu (lent) → jaune → rouge (rapide)
export function speedColor(v, vmax = 60) {
  const t = Math.max(0, Math.min(1, v / vmax));
  const stops = [[57, 135, 229], [250, 178, 25], [232, 64, 47]];
  const [a, b, u] = t < 0.5 ? [stops[0], stops[1], t * 2] : [stops[1], stops[2], (t - 0.5) * 2];
  return `rgb(${a.map((c, k) => Math.round(c + (b[k] - c) * u)).join(",")})`;
}

function makeView(width, height, cx, cy, scale) {
  return {
    scale,
    toScreen: ([x, y]) => [width / 2 + (x - cx) * scale, height / 2 - (y - cy) * scale],
    toWorld: ([sx, sy]) => [cx + (sx - width / 2) / scale, cy - (sy - height / 2) / scale],
  };
}

function path(ctx, pts, view, close, append = false) {
  if (!append) ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = view.toScreen(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (close) ctx.closePath();
}

export function drawCar(ctx, view, { x, y, psi, color, label }) {
  const [sx, sy] = view.toScreen([x, y]);
  const len = Math.max(16, CAR_LENGTH * view.scale);
  const w = len * 0.42;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-psi); // y écran vers le bas : angle inversé
  ctx.shadowColor = "#000a";
  ctx.shadowBlur = 6;
  ctx.fillStyle = color;
  ctx.strokeStyle = "#0b0c0e";
  ctx.lineWidth = 1.5;
  // Monoplace stylisée : nez pointu, ailerons avant et arrière
  ctx.beginPath();
  ctx.moveTo(len * 0.55, 0);
  ctx.lineTo(len * 0.1, w * 0.28);
  ctx.lineTo(-len * 0.45, w * 0.32);
  ctx.lineTo(-len * 0.45, -w * 0.32);
  ctx.lineTo(len * 0.1, -w * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillRect(len * 0.32, -w * 0.5, len * 0.08, w);   // aileron avant
  ctx.fillRect(-len * 0.5, -w * 0.5, len * 0.1, w);    // aileron arrière
  ctx.fillStyle = "#0b0c0e";
  ctx.beginPath();
  ctx.arc(-len * 0.05, 0, w * 0.14, 0, 2 * Math.PI);    // cockpit
  ctx.fill();
  ctx.restore();
  if (label) {
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = "#f1f2f4";
    ctx.strokeStyle = "#0b0c0e";
    ctx.lineWidth = 3;
    ctx.strokeText(label, sx + len * 0.6, sy - len * 0.6);
    ctx.fillText(label, sx + len * 0.6, sy - len * 0.6);
  }
}

export default function TrackCanvas({ track, cars = [], trails = [], rays = null, draw = null, onPointer = null,
                                      height = 520, extraPoints = [], fixedView = null, label,
                                      followable = true, tools = true }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const [center, setCenter] = useState(null); // centre choisi à la main (mètres), sinon cadrage auto
  const [follow, setFollow] = useState(false);
  const [width, setWidth] = useState(800);

  const geom = useMemo(() => {
    if (!track) return null;
    const { left, right } = trackBorders(track);
    const kappa = curvatures(track.centerline);
    return { left, right, kerb: kappa.map((k) => Math.abs(k) > KERB_CURVATURE), box: bounds([...left, ...right], 12) };
  }, [track]);

  // Nouveau circuit : on recadre
  useEffect(() => { setZoom(1); setCenter(null); }, [track]);

  // Largeur réelle du canvas (redessin au redimensionnement)
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const obs = new ResizeObserver(() => setWidth(el.clientWidth));
    obs.observe(el);
    return () => obs.disconnect();
  }, [geom]);

  function baseView() {
    const box = extraPoints.length ? bounds([...geom.left, ...geom.right, ...extraPoints], 12) : geom.box;
    const fit = Math.min((width - 32) / (box.maxX - box.minX), (height - 32) / (box.maxY - box.minY));
    const target = follow && cars[0] ? [cars[0].x, cars[0].y] : center ?? [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2];
    return makeView(width, height, target[0], target[1], fit * zoom);
  }

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !geom) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#101418";
    ctx.fillRect(0, 0, width, height);
    const view = fixedView ?? baseView();
    canvas._view = view;
    const px = Math.max(1, view.scale); // 1 m en pixels

    // Asphalte : surface entre les deux bords (règle pair-impair)
    ctx.fillStyle = "#2c3036";
    path(ctx, geom.left, view, true);
    path(ctx, geom.right, view, true, true);
    ctx.fill("evenodd");
    // Lignes blanches de bord
    ctx.strokeStyle = "#d9dce1";
    ctx.lineWidth = Math.max(1, 0.35 * px);
    path(ctx, geom.left, view, true);
    ctx.stroke();
    path(ctx, geom.right, view, true);
    ctx.stroke();
    // Vibreurs rouge / blanc dans les virages serrés
    ctx.lineWidth = Math.max(2, 1.0 * px);
    const n = geom.left.length;
    for (const border of [geom.left, geom.right]) {
      for (let i = 0; i < n; i++) {
        if (!geom.kerb[i]) continue;
        ctx.strokeStyle = i % 2 ? "#e8402f" : "#f1f2f4";
        ctx.beginPath();
        ctx.moveTo(...view.toScreen(border[i]));
        ctx.lineTo(...view.toScreen(border[(i + 1) % n]));
        ctx.stroke();
      }
    }
    // Checkpoints discrets, ligne d'arrivée en damier
    track.checkpoints.forEach((ci, k) => {
      const a = view.toScreen(geom.left[ci]);
      const b = view.toScreen(geom.right[ci]);
      if (k > 0) {
        ctx.strokeStyle = "#ffffff22";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.stroke();
        return;
      }
      const squares = 8;
      for (let s = 0; s < squares; s++) {
        ctx.strokeStyle = s % 2 ? "#111" : "#fff";
        ctx.lineWidth = Math.max(3, 1.2 * px);
        ctx.beginPath();
        ctx.moveTo(a[0] + ((b[0] - a[0]) * s) / squares, a[1] + ((b[1] - a[1]) * s) / squares);
        ctx.lineTo(a[0] + ((b[0] - a[0]) * (s + 1)) / squares, a[1] + ((b[1] - a[1]) * (s + 1)) / squares);
        ctx.stroke();
      }
    });

    // Trajectoires : une couleur, ou la vitesse segment par segment
    for (const t of trails) {
      if (t.points.length < 2) continue;
      ctx.globalAlpha = t.alpha ?? 0.9;
      ctx.lineWidth = t.width ?? 2.5;
      ctx.lineCap = "round";
      if (t.speeds) {
        for (let i = 1; i < t.points.length; i++) {
          ctx.strokeStyle = speedColor(t.speeds[i], t.speedColorMax);
          ctx.beginPath();
          ctx.moveTo(...view.toScreen(t.points[i - 1]));
          ctx.lineTo(...view.toScreen(t.points[i]));
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = t.color;
        path(ctx, t.points, view, false);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (rays) {
      SENSOR_ANGLES_DEG.forEach((deg, k) => {
        const a = rays.psi + (deg * Math.PI) / 180;
        const d = rays.distances[k];
        const end = view.toScreen([rays.x + d * Math.cos(a), rays.y + d * Math.sin(a)]);
        ctx.strokeStyle = "#fab21999";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(...view.toScreen([rays.x, rays.y]));
        ctx.lineTo(...end);
        ctx.stroke();
        ctx.fillStyle = "#fab219";
        ctx.beginPath();
        ctx.arc(end[0], end[1], 2.5, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
    cars.forEach((c) => drawCar(ctx, view, c));
    if (draw) draw(ctx, view);
  });

  const pointer = (type) => (e) => {
    const canvas = ref.current;
    if (!canvas?._view) return;
    const r = canvas.getBoundingClientRect();
    const screen = [e.clientX - r.left, e.clientY - r.top];
    const panGesture = !onPointer || e.shiftKey || e.button === 1;
    if (type === "down" && panGesture && !fixedView) {
      drag.current = { screen, center: canvas._view.toWorld([width / 2, height / 2]) };
      setFollow(false);
      canvas.setPointerCapture?.(e.pointerId);
      return;
    }
    if (drag.current) {
      if (type === "move") {
        const s = canvas._view.scale;
        const [cx, cy] = drag.current.center;
        setCenter([cx - (screen[0] - drag.current.screen[0]) / s, cy + (screen[1] - drag.current.screen[1]) / s]);
      } else if (type === "up" || type === "cancel") {
        drag.current = null;
      }
      return;
    }
    if (onPointer) onPointer(type, canvas._view.toWorld(screen), e, canvas._view);
  };

  // Zoom à la molette autour du curseur
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || fixedView) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const view = canvas._view;
      if (!view) return;
      const r = canvas.getBoundingClientRect();
      const before = view.toWorld([e.clientX - r.left, e.clientY - r.top]);
      const z = zoomRef.current;
      const nz = Math.min(40, Math.max(0.5, z * Math.exp(-e.deltaY * 0.0015)));
      // Le point sous le curseur reste sous le curseur : le centre se rapproche de lui
      const ratio = z / nz;
      const c = view.toWorld([width / 2, height / 2]);
      zoomRef.current = nz;
      setZoom(nz);
      setCenter([before[0] + (c[0] - before[0]) * ratio, before[1] + (c[1] - before[1]) * ratio]); // ignoré en suivi
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [fixedView, width, height, geom]);

  const compact = width < 560; // petit canvas : boutons réduits à des symboles
  if (!track) return <div className="empty">Aucun circuit chargé.</div>;
  return (
    <div className="canvas-wrap">
      <canvas ref={ref} style={{ height, touchAction: "none", cursor: onPointer ? "crosshair" : "grab" }}
              aria-label={label ?? `Circuit ${track.name}`} tabIndex={onPointer ? 0 : undefined}
              onPointerDown={pointer("down")} onPointerMove={pointer("move")} onPointerUp={pointer("up")}
              onPointerCancel={pointer("cancel")} onDoubleClick={pointer("double")}
              onContextMenu={pointer("context")} />
      {tools && !fixedView && (
        <div className="canvas-tools">
          <button onClick={() => setZoom((z) => Math.min(40, z * 1.5))} aria-label="Zoomer" title="Zoomer">+</button>
          <button onClick={() => setZoom((z) => Math.max(0.5, z / 1.5))} aria-label="Dézoomer" title="Dézoomer">−</button>
          <button onClick={() => { setZoom(1); setCenter(null); setFollow(false); }} title="Recentrer">
            {compact ? "⟲" : "Recentrer"}
          </button>
          {followable && cars.length > 0 && (
            <button className={follow ? "on" : ""} title="Suivre la voiture"
                    onClick={() => { setFollow(!follow); if (!follow) setZoom((z) => Math.max(z, 4)); }}>
              {compact ? "◎" : "Suivre la voiture"}
            </button>
          )}
        </div>
      )}
      {tools && !fixedView && !compact && (
        <div className="canvas-hint">Molette : zoom · glisser{onPointer ? " avec Maj" : ""} : déplacer</div>
      )}
    </div>
  );
}
