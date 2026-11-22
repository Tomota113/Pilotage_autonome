import { bounds } from "../../data/geometry.js";
import { gridOffset, gridSlot } from "./raceData.js";

export const SECTOR_COLORS = ["#79b8cc", "#e9c279", "#c9a3e2"];
const GRASS = "#141f1d";
const TAU = Math.PI * 2;

// Ligne centrale parcourue à reculons depuis la ligne de départ (jusqu'à 400 m) : la grille visuelle
// d'AI Championship place les voitures le long du tracé, donc toujours sur la piste, même avant un virage.
const GRID_LENGTH = 400;

export function trackStart(track) {
  const { centerline: points, start: { index }, width } = track;
  const [x, y] = points[index];
  const back = [{ x, y, dist: 0 }];
  for (let k = 1, dist = 0; k < points.length && dist < GRID_LENGTH; k += 1) {
    const [px, py] = points[(index - k + points.length) % points.length];
    const last = back[back.length - 1];
    dist += Math.hypot(px - last.x, py - last.y);
    back.push({ x: px, y: py, dist });
  }
  const halfWidth = 0.5 * (Array.isArray(width) ? width[index] : width ?? 12);
  return { x, y, heading: track.start.heading, back, halfWidth };
}

export function makeView(width, height, cx, cy, scale, angle = 0) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    width, height, scale, angle,
    center: [cx, cy],
    toScreen: ([x, y]) => [
      width / 2 + ((x - cx) * cos - (y - cy) * sin) * scale,
      height / 2 - ((x - cx) * sin + (y - cy) * cos) * scale,
    ],
    toWorld: ([sx, sy]) => {
      const x = (sx - width / 2) / scale;
      const y = (height / 2 - sy) / scale;
      return [cx + x * cos + y * sin, cy - x * sin + y * cos];
    },
  };
}

function fitAxis(min, max, pixels, start, gridMin, gridMax) {
  return Math.min(pixels / Math.max(1, max - min),
    start > min ? (pixels - gridMax) / (start - min) : Infinity,
    max > start ? (pixels + gridMin) / (max - start) : Infinity);
}

export function broadcastFit(points, width, height, start, gridCount) {
  const margin = 20;
  const slots = Array.from({ length: gridCount }, (_, index) => gridOffset(gridSlot(index), start.heading));
  let best;
  // On essaie plusieurs orientations pour exploiter le format paysage, en réservant la place de la grille.
  for (let step = 0; step < 12; step++) {
    const angle = Math.PI * step / 12;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotate = ([x, y]) => [x * cos - y * sin, x * sin + y * cos];
    const box = bounds(points.map(rotate));
    const [x, y] = start ? rotate([start.x, start.y]) : [0, 0];
    const grid = slots.length ? bounds(slots.map(rotate), 10) : null;
    const availableWidth = Math.max(1, width - margin * 2);
    const availableHeight = Math.max(1, height - margin * 2);
    const scale = grid
      ? Math.min(
        fitAxis(box.minX, box.maxX, availableWidth, x, grid.minX, grid.maxX),
        fitAxis(box.minY, box.maxY, availableHeight, y, grid.minY, grid.maxY),
      )
      : Math.min(availableWidth / Math.max(1, box.maxX - box.minX),
        availableHeight / Math.max(1, box.maxY - box.minY));
    if (scale <= 0 || (best && scale <= best.scale * 1.005)) continue;
    const cx = grid ? (Math.min(box.minX, x + grid.minX / scale) + Math.max(box.maxX, x + grid.maxX / scale)) / 2
      : (box.minX + box.maxX) / 2;
    const cy = grid ? (Math.min(box.minY, y + grid.minY / scale) + Math.max(box.maxY, y + grid.maxY / scale)) / 2
      : (box.minY + box.maxY) / 2;
    best = makeView(width, height, cx * cos + cy * sin, -cx * sin + cy * cos, scale, angle);
  }
  return best ?? broadcastFit(points, width, height, start, 0);
}

export function addPath(path, points, close = false) {
  path.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) path.lineTo(...points[i]);
  if (close) path.closePath();
}

function curvature(points, index) {
  const [ax, ay] = points[(index - 1 + points.length) % points.length];
  const [bx, by] = points[index];
  const [cx, cy] = points[(index + 1) % points.length];
  const length = (Math.hypot(bx - ax, by - ay) + Math.hypot(cx - bx, cy - by)) / 2;
  const turn = Math.atan2(cy - by, cx - bx) - Math.atan2(by - ay, bx - ax);
  return length ? Math.atan2(Math.sin(turn), Math.cos(turn)) / length : 0;
}

export function makeTrackArtwork(track, left, right, broadcast) {
  const road = new Path2D();
  const line = new Path2D();
  const sectors = SECTOR_COLORS.map(() => new Path2D());
  const kerbs = [new Path2D(), new Path2D()];
  const { centerline: points, start: { index } } = track;
  addPath(road, left, true);
  addPath(road, right, true);
  addPath(line, points, true);
  const distance = [0];
  const ordered = points.map((_, i) => (index + i) % points.length);
  ordered.push(index);
  for (let i = 1; i < ordered.length; i++) {
    const [x, y] = points[ordered[i]];
    const [px, py] = points[ordered[i - 1]];
    distance.push(distance[i - 1] + Math.hypot(x - px, y - py));
  }
  const third = distance.at(-1) / 3;
  for (let i = 0; i < points.length; i++) {
    const a = ordered[i], b = ordered[i + 1];
    const turn = curvature(points, a);
    if (Math.abs(turn) > 1 / 90) {
      const borders = broadcast ? [turn > 0 ? left : right] : [left, right];
      for (const border of borders) addPath(kerbs[i % 2], [border[a], border[b]]);
    }
    if (broadcast) {
      // Trois secteurs de longueur égale, calculés depuis la ligne de départ.
      const length = distance[i + 1] - distance[i];
      let d = distance[i];
      while (d < distance[i + 1]) {
        const sector = Math.min(2, Math.floor(d / third + 1e-10));
        const next = Math.min(distance[i + 1], (sector + 1) * third);
        if (next <= d) break;
        for (const border of [left, right]) {
          const edge = (metres) => border[a].map((value, axis) => value + (border[b][axis] - value) * ((metres - distance[i]) / length));
          addPath(sectors[sector], [edge(d), edge(next)]);
        }
        d = next;
      }
    }
  }
  return { road, line, sectors, kerbs, mapPoints: ordered.map((i) => points[i]), start: trackStart(track) };
}

function drawFinish(ctx, view, left, right) {
  const [ax, ay] = view.toScreen(left);
  const [bx, by] = view.toScreen(right);
  const angle = Math.atan2(by - ay, bx - ax);
  const length = Math.max(9, Math.hypot(bx - ax, by - ay));
  const cell = length / Math.max(4, Math.round(length / 3));
  ctx.save();
  ctx.translate((ax + bx) / 2, (ay + by) / 2);
  ctx.rotate(angle);
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < Math.round(length / cell); i++) {
      ctx.fillStyle = (i + row) % 2 ? "#12181b" : "#fff";
      ctx.fillRect(i * cell - length / 2, (row - 1) * cell, cell + 0.15, cell + 0.15);
    }
  }
  ctx.restore();
}

export function applyWorldTransform(ctx, view) {
  const [ox, oy] = view.toScreen([0, 0]);
  ctx.translate(ox, oy);
  ctx.rotate(-(view.angle ?? 0));
  ctx.scale(view.scale, -view.scale);
}

export function drawTrackArtwork(ctx, view, geom, track, width, height, broadcast, wet) {
  ctx.fillStyle = broadcast ? GRASS : "#101418";
  ctx.fillRect(0, 0, width, height);
  if (broadcast) {
    const light = ctx.createRadialGradient(width * 0.52, height * 0.43, 0, width * 0.52, height * 0.43, width * 0.64);
    light.addColorStop(0, wet ? "#243638" : "#293b31");
    light.addColorStop(1, wet ? "#10191d" : "#111b18");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#d6eddd0c";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0.5; x < width; x += 32) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (let y = 0.5; y < height; y += 32) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();
  }

  const { road, line, kerbs, sectors } = geom.artwork;
  const scale = view.scale;
  ctx.save();
  applyWorldTransform(ctx, view);
  ctx.lineJoin = "round";
  if (broadcast) {
    ctx.strokeStyle = "#0a1312";
    ctx.lineWidth = 10 / scale;
    ctx.stroke(road);
    ctx.strokeStyle = wet ? "#43565b" : "#50614f";
    ctx.lineWidth = 6.5 / scale;
    ctx.stroke(road);
    ctx.lineCap = "round";
    sectors.forEach((sector, i) => {
      ctx.globalAlpha = 0.49;
      ctx.strokeStyle = SECTOR_COLORS[i];
      ctx.lineWidth = 3.6 / scale;
      ctx.stroke(sector);
    });
    ctx.globalAlpha = 1;
  }
  // La surface d'asphalte suit la largeur mesurée à chaque point du fichier de circuit.
  ctx.fillStyle = wet ? "#1b282f" : broadcast ? "#353b40" : "#2c3036";
  ctx.fill(road, "evenodd");
  if (wet) {
    ctx.save();
    ctx.clip(road, "evenodd");
    const shine = ctx.createLinearGradient(-20 / scale, -60 / scale, width / scale, height / scale);
    shine.addColorStop(0, "#9bc6db18");
    shine.addColorStop(0.45, "#9dd5f631");
    shine.addColorStop(1, "#bddcf535");
    ctx.strokeStyle = shine;
    ctx.lineWidth = Math.max(3.5, 1.2 / scale);
    ctx.stroke(line);
    ctx.restore();
  }
  ctx.strokeStyle = broadcast ? "#f4f4ee" : "#d9dce1";
  ctx.lineWidth = Math.max(broadcast ? 1.05 : 1, 0.35 * scale) / scale;
  ctx.stroke(road);
  ctx.lineCap = "butt";
  ctx.lineWidth = Math.max(broadcast ? 2.5 : 2, scale) / scale;
  kerbs.forEach((kerb, i) => {
    ctx.strokeStyle = i ? "#f6efe9" : "#ee5048";
    ctx.stroke(kerb);
  });
  ctx.restore();

  if (!broadcast) for (const index of track.checkpoints.slice(1)) {
    ctx.strokeStyle = "#ffffff22";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(...view.toScreen(geom.left[index]));
    ctx.lineTo(...view.toScreen(geom.right[index]));
    ctx.stroke();
  }
  const index = track.start.index;
  drawFinish(ctx, view, geom.left[index], geom.right[index]);
}

export function drawRain(ctx, width, height, now, intensity) {
  ctx.strokeStyle = "#b6d8ec27";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const travel = now * (intensity ? 0.12 : 0.09);
  for (let i = 0; i < (intensity ? 90 : 48); i++) {
    const x = ((i * 113.71 + travel * 0.32) % (width + 25)) - 10;
    const y = ((i * 157.39 + travel * (1 + (i % 4) * 0.19)) % (height + 25)) - 12;
    ctx.moveTo(x, y);
    ctx.lineTo(x + 2.5, y + 9);
  }
  ctx.stroke();
}

export function makeMiniMap(geom, width) {
  const w = Math.min(175, width * 0.43);
  const h = 88;
  const map = broadcastFit(geom.artwork.mapPoints, w, h, null, 0);
  const path = new Path2D();
  addPath(path, geom.artwork.mapPoints.map(map.toScreen));
  return { w, h, map, path };
}

export function drawMiniMap(ctx, { w, h, map, path }, followed, height) {
  ctx.save();
  ctx.translate(12, height - h - 32);
  ctx.fillStyle = "#0b151aee";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#a2b7b35c";
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  ctx.strokeStyle = "#9ab4b7";
  ctx.lineWidth = 1.5;
  ctx.stroke(path);
  const [sx, sy] = map.toScreen([followed.x, followed.y]);
  ctx.fillStyle = followed.color;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sx, sy, 4.5, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
