import { CAR_MODELS, isF1Track } from "./f1.js";
import { SENSOR_ANGLES_DEG } from "./geometry.js";

const TABULAR = new Set(["qlearning", "sarsa", "montecarlo"]);
const DISCRETE_NETWORKS = new Set(["dqn", "qrdqn", "deep_sarsa", "deep_mc"]);

// Même portée, mêmes horizons et mêmes échelles que dans env/f1_env.py.
const PERCEPTION = {
  v1: { lookahead: [30, 80], speedScale: 63 },
  f1_2024: { lookahead: [50, 150], speedScale: 96 },
};

export function getPerception(car) {
  const model = car === "f1_2024" ? car : "v1";
  return { ...PERCEPTION[model], sensorRange: CAR_MODELS[model].sensorRange };
}

export function getObservationLabels(car, count = 12) {
  const { lookahead } = getPerception(car);
  const labels = [
    ...SENSOR_ANGLES_DEG.map((angle) => {
      const sign = angle < 0 ? "−" : angle > 0 ? "+" : "";
      return `Distance au bord à ${sign}${Math.abs(angle)}°`;
    }),
    "Vitesse avant la commande",
    "Angle voiture–piste",
    "Écart au centre de la piste",
    ...lookahead.map((distance) => `Courbure à ${distance} m`),
    "Adhérence",
  ];
  return Array.from({ length: count }, (_, index) => labels[index] ?? `Observation ${index + 1}`);
}

export function denormalizeObservation(obs, car, halfWidth) {
  const { sensorRange, speedScale } = getPerception(car);
  const scales = [
    ...SENSOR_ANGLES_DEG.map(() => [sensorRange, "m"]),
    [speedScale * 3.6, "km/h"],
    [180, "°"],
    [halfWidth, "m"],
    [0.1, "m⁻¹"],
    [0.1, "m⁻¹"],
    [1.5, ""],
  ];

  return obs.map((value, index) => {
    const [scale, unit] = scales[index] ?? [];
    if (value === 0 && index === 9) return { value: 0, unit };
    return { value: Number.isFinite(scale) ? value * scale : null, unit };
  });
}

// L'écart est divisé par la demi-largeur au point projeté sur la ligne centrale.
export function getTrackHalfWidth(track, position) {
  if (!track || !Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return undefined;
  const { centerline, width } = track;
  let minDistance = Infinity;
  let halfWidth;
  for (let index = 0; index < centerline.length; index++) {
    const next = (index + 1) % centerline.length;
    const [x, y] = centerline[index];
    const dx = centerline[next][0] - x;
    const dy = centerline[next][1] - y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) continue;
    const offsetX = position.x - x;
    const offsetY = position.y - y;
    const fraction = Math.max(0, Math.min(1, (offsetX * dx + offsetY * dy) / lengthSquared));
    const distance = (offsetX - fraction * dx) ** 2 + (offsetY - fraction * dy) ** 2;
    if (distance < minDistance) {
      minDistance = distance;
      halfWidth = (width[index] * (1 - fraction) + width[next] * fraction) / 2;
    }
  }
  return halfWidth;
}

export function topActivations(values, limit = 10) {
  return values.map((value, index) => ({ neuron: index + 1, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.neuron - b.neuron)
    .slice(0, Math.max(0, limit));
}

export function getAgentKind(algo) {
  if (TABULAR.has(algo)) return "tabular";
  if (algo === "classic" || algo === "raceline") return "driver";
  return "network";
}

export function getActionMode(replay) {
  const algo = replay.agent?.algo;
  const outputs = replay.network?.layers.at(-1);
  if (DISCRETE_NETWORKS.has(algo) || TABULAR.has(algo) || outputs === 9) return "discrete9";
  if (outputs === 2) return "pedal";
  if (outputs === 3) return "continuous";
  return null;
}

// Le replay stocke la commande décodée, y compris pour la pédale unique.
export const pedalValue = ({ throttle, brake }) => throttle - brake;

// Une grille carrée conserve le numéro du neurone d’une image à l’autre.
export function neuronGrid(size) {
  const columns = Math.ceil(Math.sqrt(size));
  return Array.from({ length: size }, (_, index) => ({
    column: index % columns,
    row: Math.floor(index / columns),
  }));
}

// On associe les rangs des deux colonnes. L’épaisseur suit l’amplitude relative
// des deux extrémités. Le replay ne fournit pas les poids des connexions.
export function topActivationLinks(source, target, limit = 4) {
  const from = topActivations(source, limit).filter(({ value }) => value !== 0);
  const to = topActivations(target, limit).filter(({ value }) => value !== 0);
  return from.slice(0, to.length).map(({ neuron, value }, index) => ({
    from: neuron - 1,
    to: to[index].neuron - 1,
    strength: Math.sqrt(Math.abs(value / from[0].value) * Math.abs(to[index].value / to[0].value)),
  }));
}

// Même ordre que DISCRETE9 dans env/f1_env.py.
export const ACTION_LABELS = ["Gauche", "Tout droit", "Droite"].flatMap(
  (direction) => ["Gaz", "Roue libre", "Frein"].map((pedal) => `${direction} · ${pedal}`),
);

export function getDiscreteOutput(frame) {
  const { steer, throttle, brake } = frame.action;
  const direction = [1, 0, -1].indexOf(steer);
  const pedal = [[1, 0], [0, 0], [0, 1]].findIndex(([gas, stop]) => gas === throttle && stop === brake);
  const chosen = direction >= 0 && pedal >= 0 ? direction * 3 + pedal : -1;
  const values = frame.q_values;
  const scores = Array.isArray(values) && values.length === ACTION_LABELS.length && values.every(Number.isFinite)
    ? values : null;
  return { chosen, scores };
}

export function pickNetworkReplay(replays, excluded = new Set(), evaluation = []) {
  const candidates = replays.filter((replay) => replay.has_activations && !excluded.has(replay.path));
  const f1 = candidates.filter(({ car, track_id }) => car === "f1_2024" && isF1Track(track_id));
  const testTracks = f1.filter(({ track_id }) => track_id.startsWith("f1_"));
  const circuits = [testTracks, f1, candidates].find((group) => group.length) ?? [];
  const normal = circuits.filter(({ mu_factor }) => mu_factor === 1);
  const pool = normal.length ? normal : circuits;
  const laps = pool.filter(({ outcome, lap_time }) => outcome === "lap" && Number.isFinite(lap_time) && lap_time > 0);
  // Privilégier la condition la mieux évaluée parmi les tours de démonstration disponibles.
  const comparable = laps.length ? laps : pool;
  const rates = new Map(evaluation.map(({ condition, rate }) => [condition, rate]));
  const bestRate = Math.max(...comparable.map(({ condition }) => rates.get(condition) ?? -Infinity));
  const preferred = Number.isFinite(bestRate) ? comparable.filter(({ condition }) => rates.get(condition) === bestRate) : comparable;
  if (!laps.length) return preferred[0];

  // Choisir le circuit avec le plus de conditions ayant bouclé un tour,
  // puis comparer les temps à circuit et adhérence identiques.
  const groups = new Map();
  for (const lap of laps) {
    const key = `${lap.track_id}/${lap.mu_factor}`;
    if (!groups.has(key)) groups.set(key, new Map());
    const byCondition = groups.get(key);
    const condition = lap.condition ?? lap.run_id;
    if (!byCondition.has(condition) || lap.lap_time < byCondition.get(condition).lap_time) byCondition.set(condition, lap);
  }
  const preferredPaths = new Set(preferred.map(({ path }) => path));
  const ordered = [...groups.values()].sort((a, b) => b.size - a.size);
  const best = ordered.find((group) => [...group.values()].some(({ path }) => preferredPaths.has(path)));
  return [...best.values()].filter(({ path }) => preferredPaths.has(path)).sort((a, b) => a.lap_time - b.lap_time)[0];
}
