// Dessin d'un circuit en Canvas 2D : piste, vibreurs, ligne d'arrivée, voitures, trajectoires
// (colorées selon la vitesse si `speeds` est fourni) et rayons des capteurs.
// Navigation : molette = zoom autour du curseur, glisser = déplacer (Maj + glisser quand la page
// édite la piste avec `onPointer`), boutons + / − / recentrer / suivre la voiture.
// `draw(ctx, view)` ajoute des éléments ; `onPointer(type, [x, y], event, view)` reçoit la souris en mètres.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bounds, SENSOR_ANGLES_DEG, trackBorders } from "../data/geometry.js";
import { frameIndexAt, interpolateFrame } from "../data/interpolate.js";

const CAR_LENGTH = 5.5; // m
const KERB_CURVATURE = 1 / 90; // vibreurs dans les virages de rayon < 90 m
const TRAIL_SECONDS = 2;
const IMPACT_MS = 420;
const FOLLOW_ZOOM = 4;
const FOLLOW_SMOOTHING_MS = 120;

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
    center: [cx, cy],
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

  // Les pneus débordent du châssis et restent lisibles même en vue d'ensemble.
  ctx.fillStyle = "#090b0e";
  ctx.strokeStyle = "#626773";
  ctx.lineWidth = 0.65;
  for (const axle of [-0.37, 0.23]) {
    for (const side of [-1, 1]) {
      const tx = len * axle;
      const ty = w * side * 0.48 - w * 0.15;
      ctx.fillRect(tx, ty, len * 0.19, w * 0.3);
      ctx.strokeRect(tx, ty, len * 0.19, w * 0.3);
    }
  }
  ctx.shadowColor = color;
  ctx.shadowBlur = 5;
  ctx.fillStyle = color;
  ctx.strokeStyle = "#0b0c0e";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(len * 0.55, 0);
  ctx.lineTo(len * 0.12, w * 0.2);
  ctx.lineTo(-len * 0.12, w * 0.34);
  ctx.lineTo(-len * 0.45, w * 0.24);
  ctx.lineTo(-len * 0.45, -w * 0.24);
  ctx.lineTo(-len * 0.12, -w * 0.34);
  ctx.lineTo(len * 0.12, -w * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(len * 0.39, -w * 0.62, len * 0.10, w * 1.24); // aileron avant
  ctx.fillRect(-len * 0.49, -w * 0.51, len * 0.11, w * 1.02); // aileron arrière
  ctx.shadowBlur = 0;
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

function drawWake(ctx, view, car) {
  const { frames, time, color } = car;
  if (!frames || car.t <= frames[0].t || time - car.t >= TRAIL_SECONDS) return;
  const start = time - TRAIL_SECONDS;
  const first = frameIndexAt(frames, start);
  const last = frameIndexAt(frames, time);
  let previous = interpolateFrame(frames, start);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  for (let i = first + 1; i <= last + 1; i++) {
    const next = i <= last ? frames[i] : car;
    if (next.t <= previous.t) continue;
    ctx.globalAlpha = 0.65 * (1 - (time - (next.t + previous.t) / 2) / TRAIL_SECONDS);
    ctx.beginPath();
    ctx.moveTo(...view.toScreen([previous.x, previous.y]));
    ctx.lineTo(...view.toScreen([next.x, next.y]));
    ctx.stroke();
    previous = next;
  }
  ctx.globalAlpha = 1;
}

function drawImpact(ctx, view, frame, age) {
  const [x, y] = view.toScreen([frame.x, frame.y]);
  ctx.save();
  ctx.globalAlpha = (1 - age) * 0.72;
  ctx.fillStyle = ctx.strokeStyle = "#ef493d";
  ctx.beginPath();
  ctx.arc(x, y, 8 + 18 * age, 0, 2 * Math.PI);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha *= 0.3;
  ctx.fill();
  ctx.restore();
}

function drawFollowMarker(ctx, view, car) {
  const [x, y] = view.toScreen([car.x, car.y]);
  const top = y - Math.max(16, CAR_LENGTH * view.scale) * 0.55 - 10;
  ctx.fillStyle = "#f1f2f4";
  ctx.strokeStyle = "#0b0c0e";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 5, top);
  ctx.lineTo(x + 5, top);
  ctx.lineTo(x, top + 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

export default function TrackCanvas({ track, cars = [], trails = [], rays = null, draw = null, onPointer = null,
                                      height = 520, extraPoints, fixedView = null, label,
                                      followable = true, followedCarId, onFollowChange, tools = true,
                                      getScene = null, animating = false, fullscreen = false, header, overlay, children }) {
  const ref = useRef(null);
  const viewport = useRef(null);
  const requestedFullscreenExit = useRef(false);
  const drag = useRef(null);
  const background = useRef(null);
  const impacts = useRef(new Map());
  const paint = useRef(null);
  const pending = useRef(null);
  const followCamera = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [followZoom, setFollowZoom] = useState(FOLLOW_ZOOM);
  const followingSelectedCar = followedCarId != null;
  const activeZoom = followingSelectedCar ? followZoom : zoom;
  const setActiveZoom = followingSelectedCar ? setFollowZoom : setZoom;
  const zoomRef = useRef(1);
  zoomRef.current = activeZoom;
  const [center, setCenter] = useState(null); // centre choisi à la main (mètres), sinon cadrage auto
  const [follow, setFollow] = useState(false);
  const [size, setSize] = useState(null);
  const { width = 800, height: canvasHeight = height, dpr = 1 } = size ?? {};
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");

  const geom = useMemo(() => {
    if (!track) return null;
    const { left, right } = trackBorders(track);
    const kappa = curvatures(track.centerline);
    return { left, right, kerb: kappa.map((k) => Math.abs(k) > KERB_CURVATURE), box: bounds([...left, ...right], 12) };
  }, [track]);

  // Nouveau circuit : on recadre
  useEffect(() => {
    setZoom(1);
    setFollowZoom(FOLLOW_ZOOM);
    setCenter(null);
    followCamera.current = null;
  }, [track]);

  // En quittant le suivi, le cadrage libre repart de la vue d'ensemble.
  useEffect(() => {
    if (followingSelectedCar) {
      setZoom(1);
      setCenter(null);
    }
  }, [followingSelectedCar]);

  // Le zoom conserve des coordonnées CSS ; le tampon de dessin suit la densité de l'écran.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      setSize((previous) => previous?.width === width && previous.height === height && previous.dpr === dpr
        ? previous
        : { width, height, dpr });
    };
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [geom]);

  const stopFollowing = useCallback(() => {
    if (onFollowChange) onFollowChange(null);
    else setFollow(false);
  }, [onFollowChange]);

  const resetCamera = useCallback(() => {
    setZoom(1);
    setCenter(null);
    stopFollowing();
  }, [stopFollowing]);

  useEffect(() => {
    if (!fullscreen || !geom) return undefined;
    const el = viewport.current;
    let wasFullscreen = false;
    const update = () => {
      const next = document.fullscreenElement === el;
      if (wasFullscreen && !next) {
        // Le navigateur peut consommer Échap avant que la page reçoive la touche.
        if (!requestedFullscreenExit.current && onFollowChange) resetCamera();
        requestedFullscreenExit.current = false;
      }
      wasFullscreen = next;
      setIsFullscreen(next);
    };
    document.addEventListener("fullscreenchange", update);
    update();
    return () => document.removeEventListener("fullscreenchange", update);
  }, [fullscreen, geom, onFollowChange, resetCamera]);

  const toggleFullscreen = useCallback(async () => {
    const el = viewport.current;
    if (!el) return;
    setFullscreenError("");
    try {
      if (document.fullscreenElement === el) {
        requestedFullscreenExit.current = true;
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      requestedFullscreenExit.current = false;
      setFullscreenError("Plein écran indisponible.");
    }
  }, []);

  useEffect(() => {
    if (!fullscreen || !geom) return undefined;
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Escape" && onFollowChange) resetCamera();
      if (event.key.toLowerCase() === "f"
          && !event.target.closest?.("input:not([type=range]):not([type=checkbox]), select, textarea, [contenteditable]")) {
        event.preventDefault();
        toggleFullscreen();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [fullscreen, geom, onFollowChange, resetCamera, toggleFullscreen]);

  const fitView = useMemo(() => {
    if (!geom) return null;
    const box = extraPoints?.length ? bounds([...geom.left, ...geom.right, ...extraPoints], 12) : geom.box;
    const fit = Math.min(Math.max(1, width - 32) / (box.maxX - box.minX),
                         Math.max(1, canvasHeight - 32) / (box.maxY - box.minY));
    const target = center ?? [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2];
    return makeView(width, canvasHeight, target[0], target[1], fit * activeZoom);
  }, [activeZoom, canvasHeight, center, extraPoints, geom, width]);

  function drawTrack(ctx, view) {
    ctx.fillStyle = "#101418";
    ctx.fillRect(0, 0, width, canvasHeight);
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
  }

  function render(now) {
    const canvas = ref.current;
    if (!canvas || !geom || !width || !canvasHeight) return false;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(canvasHeight * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scene = getScene?.() ?? { cars, rays };
    const followed = followingSelectedCar
      ? scene.cars.find((car) => car.id === followedCarId)
      : (followedCarId === undefined && follow ? scene.cars[0] : null);
    let view = fixedView ?? fitView;
    let settling = false;
    if (followed && !fixedView) {
      let { x, y } = followed;
      if (followingSelectedCar) {
        // Un lissage dépendant du temps garde la même réponse à différentes cadences d'affichage.
        const previous = followCamera.current;
        const [cx, cy] = previous?.center ?? canvas._view?.center ?? fitView.center;
        const elapsed = previous ? Math.min(now - previous.now, 50) : 16;
        const blend = 1 - Math.exp(-elapsed / FOLLOW_SMOOTHING_MS);
        x = cx + (x - cx) * blend;
        y = cy + (y - cy) * blend;
        settling = Math.hypot(x - followed.x, y - followed.y) * fitView.scale > 0.5;
        if (!settling) ({ x, y } = followed);
        followCamera.current = { center: [x, y], now };
      }
      view = makeView(width, canvasHeight, x, y, fitView.scale);
    } else {
      followCamera.current = null;
    }
    canvas._view = view;

    // On réutilise le fond tant que la caméra reste fixe.
    ctx.lineCap = "butt";
    if (followed && !fixedView) drawTrack(ctx, view);
    else {
      const cached = background.current;
      if (!cached || cached.view !== view || cached.geom !== geom || cached.width !== pixelWidth || cached.height !== pixelHeight || cached.dpr !== dpr) {
        const layer = cached?.layer ?? document.createElement("canvas");
        layer.width = pixelWidth;
        layer.height = pixelHeight;
        const layerCtx = layer.getContext("2d");
        layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawTrack(layerCtx, view);
        background.current = { layer, view, geom, width: pixelWidth, height: pixelHeight, dpr };
      }
      ctx.drawImage(background.current.layer, 0, 0, width, canvasHeight);
    }

    // Trajectoires : une couleur, ou la vitesse segment par segment
    for (const t of trails) {
      const count = t.count ?? t.points.length;
      if (count < 2) continue;
      ctx.globalAlpha = t.alpha ?? 0.9;
      ctx.lineWidth = t.width ?? 2.5;
      ctx.lineCap = "round";
      if (t.speeds) {
        for (let i = 1; i < count; i++) {
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
    scene.cars.forEach((car) => drawWake(ctx, view, car));
    if (scene.rays) {
      const { rays } = scene;
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
    scene.cars.forEach((car) => {
      if (car !== followed) drawCar(ctx, view, car);
    });
    if (followed) {
      drawCar(ctx, view, followed);
      drawFollowMarker(ctx, view, followed);
    }
    if (draw) draw(ctx, view);

    // Le flash continue à s'estomper même si la sortie de piste a arrêté le replay.
    const currentImpacts = new Map();
    let flashing = false;
    for (const { impact } of scene.cars) {
      if (!impact) continue;
      const began = impacts.current.get(impact) ?? now;
      currentImpacts.set(impact, began);
      const age = (now - began) / IMPACT_MS;
      if (age >= 1) continue;
      drawImpact(ctx, view, impact, age);
      flashing = true;
    }
    impacts.current = currentImpacts;
    return animating || flashing || settling;
  }

  function queuePaint() {
    if (pending.current !== null) return;
    pending.current = requestAnimationFrame((now) => {
      pending.current = null;
      if (paint.current(now)) queuePaint();
    });
  }

  useEffect(() => {
    paint.current = render;
    queuePaint();
  });
  useEffect(() => () => {
    if (pending.current !== null) cancelAnimationFrame(pending.current);
    pending.current = null;
  }, []);

  const pointer = (type) => (e) => {
    const canvas = ref.current;
    if (!canvas?._view) return;
    const r = canvas.getBoundingClientRect();
    const screen = [e.clientX - r.left, e.clientY - r.top];
    const panGesture = !onPointer || e.shiftKey || e.button === 1;
    if (type === "down" && panGesture && !fixedView) {
      const { center, scale } = canvas._view;
      drag.current = { screen, center, scale };
      if (follow || followingSelectedCar) setCenter(center);
      if (followingSelectedCar) setZoom(activeZoom);
      stopFollowing();
      canvas.setPointerCapture?.(e.pointerId);
      return;
    }
    if (drag.current) {
      if (type === "move") {
        const s = drag.current.scale;
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
      zoomRef.current = nz;
      setActiveZoom(nz);
      if (!followingSelectedCar) {
        const [cx, cy] = view.center;
        setCenter([before[0] + (cx - before[0]) * ratio, before[1] + (cy - before[1]) * ratio]); // ignoré en suivi
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [fixedView, followingSelectedCar, geom, setActiveZoom]);

  const compact = width < 560; // petit canvas : boutons réduits à des symboles
  const fullscreenLabel = isFullscreen ? "Quitter le plein écran" : "Plein écran";
  if (!track) return <div className="empty">Aucun circuit chargé.</div>;
  const stage = (
    <div className="canvas-wrap">
      <canvas ref={ref} style={{ "--canvas-height": `${height}px`, touchAction: "none", cursor: onPointer ? "crosshair" : "grab" }}
              aria-label={label ?? `Circuit ${track.name}`} tabIndex={onPointer ? 0 : undefined}
              onPointerDown={pointer("down")} onPointerMove={pointer("move")} onPointerUp={pointer("up")}
              onPointerCancel={pointer("cancel")} onDoubleClick={pointer("double")}
              onContextMenu={pointer("context")} />
      {tools && !fixedView && (
        <div className="canvas-tools">
          <button onClick={() => setActiveZoom((z) => Math.min(40, z * 1.5))} aria-label="Zoomer" title="Zoomer">+</button>
          <button onClick={() => setActiveZoom((z) => Math.max(0.5, z / 1.5))} aria-label="Dézoomer" title="Dézoomer">−</button>
          <button onClick={resetCamera} title="Recentrer" aria-label="Recentrer">
            {compact ? "⟲" : "Recentrer"}
          </button>
          {followedCarId === undefined && followable && (getScene || cars.length > 0) && (
            <button className={follow ? "on" : ""} title="Suivre la voiture" aria-label="Suivre la voiture" aria-pressed={follow}
                    onClick={() => { setFollow(!follow); if (!follow) setZoom((z) => Math.max(z, FOLLOW_ZOOM)); }}>
              {compact ? "◎" : "Suivre la voiture"}
            </button>
          )}
          {fullscreen && (
            <button onClick={toggleFullscreen} aria-label={fullscreenLabel} title={`${fullscreenLabel} (F)`}>
              {compact ? (isFullscreen ? "×" : "⛶") : fullscreenLabel}
            </button>
          )}
        </div>
      )}
      {tools && !fixedView && !compact && (
        <div className="canvas-hint">Molette : zoom · glisser{onPointer ? " avec Maj" : ""} : déplacer</div>
      )}
      {overlay}
      {fullscreenError && <p className="canvas-error" role="status">{fullscreenError}</p>}
    </div>
  );
  if (!fullscreen) return stage;
  return <div className="race-viewport" ref={viewport}>{header}{stage}{children}</div>;
}
