import { CAR_MODELS } from "./f1.js";
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
