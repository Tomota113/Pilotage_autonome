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
