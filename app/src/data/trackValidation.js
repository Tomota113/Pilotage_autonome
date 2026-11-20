export const TRACK_SCHEMA = "f1rl.track/1.0";
export const TRACK_SPLITS = ["train", "test", "demo"];
const MIN_POINTS = 50;
const CHECKPOINT_COUNT = 20;
const REQUIRED = ["schema", "id", "name", "split", "centerline", "width", "mu", "start", "checkpoints", "length"];

function segmentLengths(points) {
  return points.map(([x, y], i) => {
    const [nextX, nextY] = points[(i + 1) % points.length];
    return Math.hypot(nextX - x, nextY - y);
  });
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

export function validateTrack(track) {
  if (!track || typeof track !== "object") return ["Un objet JSON est attendu."];
  const errors = REQUIRED.filter((field) => !Object.hasOwn(track, field)).map((field) => `Champ manquant · ${field}`);
  const { schema, id, name, split, centerline, width, mu, start, checkpoints, length } = track;
  if (schema !== TRACK_SCHEMA) errors.push(`Schéma attendu · ${TRACK_SCHEMA}`);
  if (typeof id !== "string" || !id || /[^a-z0-9_]/.test(id)) errors.push("Identifiant · lettres minuscules, chiffres et _ uniquement.");
  if (typeof name !== "string" || !name.trim()) errors.push("Le nom du circuit est obligatoire.");
  if (!TRACK_SPLITS.includes(split)) errors.push("Split attendu · train, test ou demo.");

  const pointCount = Array.isArray(centerline) ? centerline.length : 0;
  const validPoints = Array.isArray(centerline) && Array.from(centerline).every((point) =>
    Array.isArray(point) && point.length === 2 && Array.from(point).every(Number.isFinite));
  if (!validPoints) errors.push("La ligne centrale doit contenir des couples [x, y] de nombres finis.");
  if (pointCount < MIN_POINTS) errors.push(`La ligne centrale doit compter au moins ${MIN_POINTS} points.`);
  if (!Array.isArray(width) || !Array.isArray(mu) || width.length !== pointCount || mu.length !== pointCount) {
    errors.push("La ligne centrale, les largeurs et les valeurs de μ doivent avoir le même nombre d’entrées.");
  }
  if (!Array.isArray(width) || !Array.from(width).every((value) => Number.isFinite(value) && value > 0)) {
    errors.push("Toutes les largeurs doivent être finies et strictement positives.");
  }
  if (!Array.isArray(mu) || !Array.from(mu).every((value) => Number.isFinite(value) && value >= 0.3 && value <= 1.5)) {
    errors.push("Toutes les valeurs de μ doivent être comprises entre 0,3 et 1,5.");
  }

  const isIndex = (value) => Number.isInteger(value) && value >= 0 && value < pointCount;
  if (!isIndex(start?.index) || !Number.isFinite(start?.heading)) {
    errors.push("Le départ doit avoir un indice entier dans la piste et un cap fini en radians.");
  }
  if (!Array.isArray(checkpoints) || checkpoints.length !== CHECKPOINT_COUNT) {
    errors.push(`Le circuit doit compter exactement ${CHECKPOINT_COUNT} checkpoints.`);
  } else {
    if (!Array.from(checkpoints).every((value, i) => isIndex(value) && (i === 0 || value > checkpoints[i - 1]))) {
      errors.push("Les indices des checkpoints doivent être valides et strictement croissants.");
    }
    if (checkpoints[0] !== start?.index) errors.push("Le premier checkpoint doit correspondre à l’indice de départ.");
  }

  if (validPoints && pointCount) {
    const segments = segmentLengths(centerline);
    const computed = sum(segments);
    // Track.__init__ refuse aussi les points consécutifs confondus, y compris à la fermeture.
    if (segments.includes(0)) errors.push("Deux points consécutifs ne peuvent pas être confondus.");
    if (!Number.isFinite(length) || !Number.isFinite(computed) || Math.abs(length - computed) > 0.005 * computed) {
      errors.push("La longueur déclarée doit correspondre à la boucle fermée à 0,5 % près.");
    }
  }
  return errors;
}

export function updateTrackGeometry(track, redistributeCheckpoints = false) {
  const { centerline } = track;
  const count = centerline.length;
  const [x, y] = centerline[0];
  const [nextX, nextY] = centerline[1];
  const checkpointCount = Math.min(count, CHECKPOINT_COUNT);
  return {
    ...track,
    start: { index: 0, heading: Math.atan2(nextY - y, nextX - x) },
    checkpoints: redistributeCheckpoints
      ? Array.from({ length: checkpointCount }, (_, i) => Math.floor(i * count / checkpointCount))
      : track.checkpoints,
    length: sum(segmentLengths(centerline)),
  };
}

export function createOvalTrack() {
  const count = 120;
  const centerline = Array.from({ length: count }, (_, i) => {
    const angle = -2 * Math.PI * i / count;
    return [120 * Math.cos(angle), 65 * Math.sin(angle)];
  });
  return updateTrackGeometry({
    schema: TRACK_SCHEMA,
    id: "ovale",
    name: "Ovale",
    split: "demo",
    centerline,
    width: Array(count).fill(12),
    mu: Array(count).fill(1),
  }, true);
}

export function resampleTrack(track) {
  const distances = segmentLengths(track.centerline);
  const length = sum(distances);
  const count = Math.max(MIN_POINTS, Math.ceil(length / 5));
  if (distances.includes(0) || !Number.isSafeInteger(count)) {
    throw new Error("Corrigez les segments de la ligne centrale avant le rééchantillonnage.");
  }
  const centerline = [], width = [], mu = [];
  let segment = 0, startDistance = 0;
  for (let i = 0; i < count; i++) {
    const distance = i * length / count;
    while (segment < distances.length - 1 && startDistance + distances[segment] < distance) {
      startDistance += distances[segment++];
    }
    const next = (segment + 1) % distances.length;
    const fraction = (distance - startDistance) / distances[segment];
    const interpolate = (a, b) => a + (b - a) * fraction;
    centerline.push(track.centerline[segment].map((value, axis) => interpolate(value, track.centerline[next][axis])));
    width.push(interpolate(track.width[segment], track.width[next]));
    mu.push(interpolate(track.mu[segment], track.mu[next]));
  }
  return updateTrackGeometry({ ...track, centerline, width, mu }, true);
}
