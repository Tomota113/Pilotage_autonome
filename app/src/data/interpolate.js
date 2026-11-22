// Le contrat garantit des temps croissants. Certains replays commencent à dt, d'autres à zéro.
export function frameIndexAt(frames, time) {
  let lower = 0;
  let upper = frames.length - 1;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (frames[middle].t <= time) lower = middle;
    else upper = middle - 1;
  }
  return lower;
}

export function interpolateFrame(frames, time) {
  const index = frameIndexAt(frames, time);
  const from = frames[index];
  const to = frames[index + 1];
  if (!from || !to || time <= from.t) return from;

  const fraction = (time - from.t) / (to.t - from.t);
  const lerp = (a, b) => a + (b - a) * fraction;
  const turn = to.psi - from.psi;

  // Les observations, commandes et états discrets restent ceux de l'image précédente.
  return {
    ...from,
    t: time,
    x: lerp(from.x, to.x),
    y: lerp(from.y, to.y),
    v: lerp(from.v, to.v),
    progress: lerp(from.progress, to.progress),
    psi: from.psi + Math.atan2(Math.sin(turn), Math.cos(turn)) * fraction,
  };
}

// Premier passage à chaque nouveau maximum : un recul ou un palier ne réécrit pas le chrono.
export function progressTimeline(frames) {
  const crossings = [];
  let furthest = -Infinity;
  frames.forEach((frame, index) => {
    if (frame.progress > furthest) {
      crossings.push({ progress: frame.progress, time: frame.t, index, before: frames[index - 1] });
      furthest = frame.progress;
    }
  });
  return crossings;
}

export function passageAt(timeline, progress) {
  if (!timeline.length || progress < timeline[0].progress || progress > timeline.at(-1).progress) return null;
  let lower = 0;
  let upper = timeline.length - 1;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (timeline[middle].progress < progress) lower = middle + 1;
    else upper = middle;
  }
  const next = timeline[lower];
  if (progress === next.progress || !next.before) return next;
  const { before } = next;
  const fraction = (progress - before.progress) / (next.progress - before.progress);
  return { time: before.t + fraction * (next.time - before.t), index: next.index };
}

export function gapAtProgress(frame, reference) {
  const passage = passageAt(reference, frame.progress);
  return passage == null ? null : frame.t - passage.time;
}
