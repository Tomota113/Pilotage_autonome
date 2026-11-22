import { gapAtProgress, interpolateFrame } from "../../data/interpolate.js";

export const GRID_RELEASE_SECONDS = 1.5;
export const GRID_CAR_SIZE = 19;

export function gridSlot(index) {
  return { behind: 22 + index * 14, lateral: (index % 2 === 0 ? 1 : -1) * 17 };
}

export function gridOffset({ behind, lateral }, heading) {
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  return [-behind * cos - lateral * sin, -behind * sin + lateral * cos];
}

// Emplacement de grille le long du tracé (start.back : ligne centrale à reculons). Espacement d'au moins 8 m
// (comme une vraie grille de F1) et écart latéral limité à 60 % de la demi-largeur : la voiture reste sur l'asphalte.
export function gridTarget(start, slot, scale) {
  if (!start.back || start.back.length < 2) {
    const [dx, dy] = gridOffset(slot, start.heading);
    return { x: start.x + dx / scale, y: start.y + dy / scale, heading: start.heading };
  }
  const rank = Math.round((slot.behind - 22) / 14);
  const behind = Math.max(8 + 8 * rank, slot.behind / scale);
  const lateral = Math.sign(slot.lateral) * Math.min(0.6 * start.halfWidth, Math.abs(slot.lateral) / scale);
  const back = start.back;
  let k = 1;
  while (k < back.length - 1 && back[k].dist < behind) k += 1;
  const a = back[k - 1], b = back[k];
  const u = b.dist > a.dist ? Math.min(1, (behind - a.dist) / (b.dist - a.dist)) : 0;
  const heading = Math.atan2(a.y - b.y, a.x - b.x); // sens de la course
  return {
    x: a.x + (b.x - a.x) * u - lateral * Math.sin(heading),
    y: a.y + (b.y - a.y) * u + lateral * Math.cos(heading),
    heading,
  };
}

export function gridPose(frame, start, slot, time, scale) {
  if (time >= GRID_RELEASE_SECONDS) return frame;
  const fraction = Math.max(0, time / GRID_RELEASE_SECONDS);
  const weight = 1 - fraction * fraction * (3 - 2 * fraction);
  const target = gridTarget(start, slot, scale);
  const turn = target.heading - frame.psi;
  // Décalage purement visuel. Les temps, positions du replay et classements restent intacts.
  return {
    ...frame,
    x: frame.x + (target.x - frame.x) * weight,
    y: frame.y + (target.y - frame.y) * weight,
    psi: frame.psi + Math.atan2(Math.sin(turn), Math.cos(turn)) * weight,
  };
}

export function raceProgress(frame) {
  return Math.max(0, Math.min(1, frame.progress ?? 0));
}

export function rankRacers(racers, time) {
  const ordered = racers.map((racer, index) => {
    const done = time >= racer.end;
    const finished = done && racer.replay.summary.outcome === "lap";
    return {
      ...racer,
      frame: interpolateFrame(racer.replay.frames, time),
      initialRank: index + 1,
      done,
      finished,
    };
  });
  if (time > 0) ordered.sort((a, b) => {
    if (a.finished && b.finished) return a.replay.summary.lap_time - b.replay.summary.lap_time;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.done !== b.done) return a.done ? 1 : -1;
    return b.frame.progress - a.frame.progress;
  });
  const leader = ordered[0];
  return ordered.map((racer, index) => ({
    ...racer,
    position: index + 1,
    gained: racer.initialRank - (index + 1),
    gap: index && time > 0 && !racer.done
      ? gapAtProgress(racer.frame, leader.timeline)
      : null,
  }));
}

export function speedStats(frames) {
  let maximum = frames[0].v;
  let integral = 0;
  for (let i = 1; i < frames.length; i++) {
    const frame = frames[i];
    const previous = frames[i - 1];
    maximum = Math.max(maximum, frame.v);
    integral += (frame.t - previous.t) * (frame.v + previous.v) / 2;
  }
  const duration = frames.at(-1).t - frames[0].t;
  return { max: maximum * 3.6, mean: (duration ? integral / duration : frames[0].v) * 3.6 };
}

const LAP_FRACTION = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const GAP_SECONDS = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero",
});

export function clockLabel(time) {
  const milliseconds = Math.round(time * 1000);
  const minutes = Math.floor(milliseconds / 60000);
  const seconds = (milliseconds % 60000) / 1000;
  return `${minutes}:${LAP_FRACTION.format(seconds).padStart(6, "0")}`;
}

export function gapLabel(gap) {
  return gap == null ? "—" : `${GAP_SECONDS.format(gap)} s`;
}
