import { CONDITION_BY_ID } from "../../data/algorithms.js";

const configChecks = new Map();

export function steeringPenalty(yaml) {
  const reward = yaml.match(/^reward:[^\S\n]*(?:#[^\n]*)?\r?\n((?:[ \t]+[^\n]*\n?|\r?\n)*)/m)?.[1];
  const raw = reward?.match(/^[ \t]+lambda_steer:[ \t]*([^\s#]+)/m)?.[1];
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function readPenalty(runId) {
  if (!configChecks.has(runId)) {
    configChecks.set(runId, fetch(`/files/runs/${encodeURIComponent(runId)}/config.yaml`)
      .then((response) => response.ok ? response.text() : "")
      .then(steeringPenalty)
      .catch(() => null));
  }
  return configChecks.get(runId);
}

export async function identifyCondition({ run_id: runId, algo, mu_mode: muMode }, mode) {
  if (runId.startsWith("classic") || algo === "classic") return { condition: "classic" };
  if (algo === "ppo" && muMode === "uniform") return { condition: "ppo_mualea" };
  if (algo === "ppo" && muMode === "fixed") {
    const penalty = mode === "server" ? await readPenalty(runId) : null;
    const noPenalty = penalty === 0 || (penalty === null && /(?:^|_)nolambda(?:_|$)/.test(runId));
    return { condition: noPenalty ? "ppo_mufixe_nolambda" : "ppo_mufixe", uncertain: mode === "server" && penalty === null };
  }
  const condition = `${algo}_mufixe`;
  return { condition: algo !== "ppo" && Object.hasOwn(CONDITION_BY_ID, condition) ? condition : null };
}
