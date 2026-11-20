// Géométrie d'un circuit, calculée comme dans sim/track.py : bords = P_i ± n_i * w_i / 2,
// n_i normale à gauche de la tangente centrée (P_{i+1} - P_{i-1}).

export function trackBorders(track) {
  const pts = track.centerline;
  const n = pts.length;
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const [xp, yp] = pts[(i - 1 + n) % n];
    const [xn, yn] = pts[(i + 1) % n];
    const len = Math.hypot(xn - xp, yn - yp) || 1;
    const nx = -(yn - yp) / len;
    const ny = (xn - xp) / len;
    const h = track.width[i] / 2;
    const [x, y] = pts[i];
    left.push([x + nx * h, y + ny * h]);
    right.push([x - nx * h, y - ny * h]);
  }
  return { left, right };
}

export function bounds(points, margin = 0) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
}

// Transformation monde (m, y vers le haut) -> écran (px, y vers le bas), qui fait tenir le cadre.
export function fitView(box, width, height, pad = 16) {
  const scale = Math.min((width - 2 * pad) / (box.maxX - box.minX), (height - 2 * pad) / (box.maxY - box.minY));
  const ox = pad + ((width - 2 * pad) - scale * (box.maxX - box.minX)) / 2;
  const oy = pad + ((height - 2 * pad) - scale * (box.maxY - box.minY)) / 2;
  return {
    scale,
    toScreen: ([x, y]) => [ox + (x - box.minX) * scale, height - (oy + (y - box.minY) * scale)],
    toWorld: ([sx, sy]) => [box.minX + (sx - ox) / scale, box.minY + (height - sy - oy) / scale],
  };
}

export const SENSOR_ANGLES_DEG = [-90, -60, -30, 0, 30, 60, 90];
