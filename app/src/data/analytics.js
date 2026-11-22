import { CONDITIONS } from "./algorithms.js";

export const OUTCOMES = ["lap", "off_track", "stalled", "timeout"];
export const number = (value) => value === "" || value == null ? NaN : Number(value);
export const isReference = (condition) => condition === "classic" || condition === "raceline";
export const isF1Condition = (condition) => /_f1(?:_|$)/.test(condition);

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
export const trialSeed = (row) => row.seed === "" || row.seed == null ? row.run_id : row.seed;
const seedName = (seed) => Number.isFinite(number(seed)) ? `Graine ${seed}` : `Essai ${seed}`;

function groupBy(rows, getKey) {
  const groups = new Map();
  for (const row of rows) {
    const key = getKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

export function evaluationRows(rows) {
  return rows.filter((row) => row.condition && row.track_id && Number.isFinite(number(row.mu_factor))
    && OUTCOMES.includes(row.outcome)).map((row) => ({ ...row, mu_factor: number(row.mu_factor) }));
}

function countOutcomes(rows) {
  const outcomes = Object.fromEntries(OUTCOMES.map((key) => [key, 0]));
  for (const { outcome } of rows) outcomes[outcome]++;
  return { attempts: rows.length, laps: outcomes.lap, outcomes, rate: outcomes.lap / rows.length };
}

export function summarizeTrials(rows) {
  const byCondition = groupBy(rows, (row) => row.condition);
  const conditions = [...new Set([...CONDITIONS.map(({ id }) => id), ...byCondition.keys()])];
  return conditions.filter((condition) => byCondition.has(condition)).map((condition) => {
    const trials = byCondition.get(condition);
    return {
      condition, ...countOutcomes(trials),
      byMu: new Map([...groupBy(trials, (row) => row.mu_factor)].map(([mu, group]) => [mu, countOutcomes(group)])),
      seeds: [...groupBy(trials, trialSeed)].map(([seed, group]) => ({ seed, ...countOutcomes(group) })),
    };
  });
}

export function summarizeCircuits(rows) {
  return new Map([...groupBy(rows, (row) => row.condition)].map(([condition, trials]) => [condition,
    new Map([...groupBy(trials, (row) => row.track_id)].map(([track, group]) => [track, countOutcomes(group)])),
  ]));
}

export function summarizeShowcase(rows) {
  const groups = new Map([
    ["train", rows.filter(({ split }) => split === "train")],
    ["demo", rows.filter(({ split, track_id }) => split === "demo" && track_id.startsWith("gen_f1_"))],
  ]);
  return new Map([...groups].map(([split, trials]) => [split, summarizeTrials(trials)]));
}

const validLap = (row) => row.outcome === "lap" && Number.isFinite(number(row.lap_time)) && number(row.lap_time) > 0;
const raceKey = (row) => JSON.stringify([row.track_id, Number(row.mu_factor)]);

export function summarizeLapRatios(rows, reference = "classic") {
  const laps = rows.filter(validLap);
  const baselines = groupBy(laps.filter((row) => row.condition === reference), raceKey);
  const ratiosByCondition = groupBy(laps.flatMap((row) => {
    const matching = baselines.get(raceKey(row));
    if (!matching || row.condition === reference) return [];
    const referenceTime = mean(matching.map(({ lap_time }) => Number(lap_time)));
    return [{ ...row, lap_time: Number(row.lap_time), referenceTime, ratio: Number(row.lap_time) / referenceTime }];
  }), (row) => row.condition);
  return new Map([...ratiosByCondition].map(([condition, points]) => {
    const middle = Math.floor(points.length / 2);
    const sorted = points.map(({ ratio }) => ratio).sort((first, second) => first - second);
    const median = points.length % 2 ? sorted[middle] : mean(sorted.slice(middle - 1, middle + 1));
    return [condition, { points, median }];
  }));
}

export function summarizeTakeaways(entries) {
  const agents = entries.filter(({ condition }) => !isReference(condition));
  const highestRate = Math.max(...agents.map(({ rate }) => rate));
  const leaders = agents.filter(({ rate }) => rate === highestRate);
  const adhesion = agents.flatMap(({ byMu }) => [...byMu.keys()]);
  const lowestMu = adhesion.length ? Math.min(...adhesion) : null;
  const sum = (groups) => groups.reduce((total, { laps, attempts }) => ({
    laps: total.laps + laps, attempts: total.attempts + attempts,
  }), { laps: 0, attempts: 0 });
  const atLowestMu = (groups) => sum(groups.flatMap(({ byMu }) => byMu.has(lowestMu) ? [byMu.get(lowestMu)] : []));
  const failures = OUTCOMES.filter((outcome) => outcome !== "lap").map((outcome) => ({
    outcome, count: agents.reduce((total, { outcomes }) => total + outcomes[outcome], 0),
  }));
  const highestFailure = Math.max(...failures.map(({ count }) => count));
  return {
    leaders, lowestMu, agentsLow: atLowestMu(agents),
    referencesLow: atLowestMu(entries.filter(({ condition }) => isReference(condition))),
    tabular: sum(agents.filter(({ condition }) => /^(qlearning|sarsa|montecarlo)_/.test(condition))),
    failures: failures.filter(({ count }) => count > 0 && count === highestFailure),
  };
}

export function aggregateEvaluation(rows) {
  const valid = rows.filter((row) => row.condition && row.split && Number.isFinite(number(row.mu_factor))
    && OUTCOMES.includes(row.outcome));
  const groups = groupBy(valid, (row) => JSON.stringify([row.condition, number(row.mu_factor), row.split]));
  return [...groups].map(([key, trials]) => {
    const [condition, mu, split] = JSON.parse(key);
    const seeds = [...groupBy(trials, trialSeed).values()];
    const rates = seeds.map((group) => countOutcomes(group).rate);
    const averageBySeed = (field, filter) => mean(seeds.map((group) => mean(group.filter(filter)
      .map((row) => number(row[field])).filter(Number.isFinite))).filter(Number.isFinite));
    return {
      key, condition, mu, split, rate: mean(rates), min: Math.min(...rates), max: Math.max(...rates),
      seeds: seeds.length, episodes: trials.length, laps: countOutcomes(trials).laps,
      lapTime: averageBySeed("lap_time", validLap), offtracks: averageBySeed("offtracks", () => true),
    };
  });
}

export function aggregateLearning(sources, metric) {
  const byCondition = groupBy(sources, ({ condition }) => condition);
  return CONDITIONS.flatMap(({ id: condition }) => {
    const runs = new Map();
    for (const source of byCondition.get(condition) ?? []) {
      const seed = trialSeed(source);
      const points = new Map(source.rows.map((row) => [number(row.step), number(row[metric])])
        .filter((point) => point.every(Number.isFinite)));
      if (!points.size) continue;
      const current = runs.get(seed);
      if (!current || source.run_id > current.id) runs.set(seed, { id: source.run_id, points });
    }
    if (!runs.size) return [];
    const byStep = new Map();
    const seeds = [...runs].map(([seed, { points }]) => ({
      name: seedName(seed),
      points: [...points].sort(([first], [second]) => first - second).map(([x, y]) => {
        if (!byStep.has(x)) byStep.set(x, []);
        byStep.get(x).push(y);
        return { x, y };
      }),
    }));
    // Ne pas prolonger artificiellement les entraînements plus courts.
    const average = [...byStep].filter(([, values]) => values.length === runs.size)
      .sort(([first], [second]) => first - second).map(([x, values]) => ({ x, y: mean(values) }));
    return [{ condition, seeds, average }];
  });
}
