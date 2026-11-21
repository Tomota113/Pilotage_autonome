export const ACTION_SPACES = {
  ppo: "continuous", dqn: "discrete9", sac: "continuous", td3: "continuous", tqc: "continuous",
  qrdqn: "discrete9", deep_sarsa: "discrete9", deep_mc: "discrete9",
  qlearning: "discrete9", sarsa: "discrete9", montecarlo: "discrete9",
};

export const TRAINING_DEFAULTS = {
  algo: "ppo", seed: 0, totalSteps: 20000, trainTracks: [], testTracks: [],
  muMode: "fixed", muValue: 1, muMin: 0.5, muMax: 1.1,
  reward: { k_progress: 0.1, c_time: 0.01, p_offtrack: 10, b_lap: 50, lambda_steer: 0.05 },
  checkpointEvery: 10000, evalEvery: 10000, evalEpisodes: 2,
};

function readNumber(raw, label, { min = 0, strict = false, integer = false } = {}) {
  const value = raw === "" || raw == null ? NaN : Number(raw);
  if (!Number.isFinite(value) || (integer && !Number.isSafeInteger(value)) || (strict ? value <= min : value < min)) {
    const relation = strict ? "strictement supérieur à" : "supérieur ou égal à";
    throw new Error(`${label} · saisir un ${integer ? "entier" : "nombre"} ${relation} ${min}.`);
  }
  return value;
}

function yamlValue(value) {
  if (Array.isArray(value)) return `[${value.map(yamlValue).join(", ")}]`;
  if (typeof value === "number") {
    // PyYAML reconnaît les exposants flottants si la mantisse contient un point.
    return String(value).replace(/^(-?\d+)e([+-]\d+)$/, "$1.0e$2");
  }
  return JSON.stringify(value);
}

function serializeConfig(config) {
  return Object.entries(config).map(([field, value]) => {
    if (typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length) {
      return `${field}: ${yamlValue(value)}`;
    }
    const entries = Object.entries(value).map(([key, entry]) => `  ${key}: ${yamlValue(entry)}`);
    return [`${field}:`, ...entries].join("\n");
  }).join("\n") + "\n";
}

export function buildTrainingYaml(form) {
  if (!Object.hasOwn(ACTION_SPACES, form.algo)) throw new Error("Choisissez un algorithme d’entraînement.");
  if (!form.trainTracks.length) throw new Error("Sélectionnez au moins un circuit d’entraînement.");
  if (!["fixed", "uniform"].includes(form.muMode)) throw new Error("Choisissez un mode d’adhérence.");
  const positive = { strict: true };
  const positiveInteger = { integer: true, strict: true };
  const fixed = form.muMode === "fixed";
  const muValue = fixed ? readNumber(form.muValue, "Facteur μ fixe", positive) : TRAINING_DEFAULTS.muValue;
  const low = fixed ? TRAINING_DEFAULTS.muMin : readNumber(form.muMin, "Facteur μ minimum", positive);
  const high = fixed ? TRAINING_DEFAULTS.muMax : readNumber(form.muMax, "Facteur μ maximum", positive);
  if (low > high) throw new Error("Le facteur μ minimum doit être inférieur ou égal au maximum.");
  const reward = Object.fromEntries(Object.keys(TRAINING_DEFAULTS.reward).map((key) =>
    [key, readNumber(form.reward[key], key)]));
  return serializeConfig({
    schema: "f1rl.config/1.3",
    algo: form.algo,
    seed: readNumber(form.seed, "Graine", { integer: true }),
    total_steps: readNumber(form.totalSteps, "Nombre de pas", positiveInteger),
    n_envs: 1,
    tracks: { train: form.trainTracks, test: form.testTracks },
    mu: { mode: form.muMode, value: muValue, range: [low, high] },
    env: {
      dt: 0.05, action_repeat: 5, action_space: ACTION_SPACES[form.algo],
      max_steps: 3000, stall_steps: 100, observe_mu: false,
    },
    reward,
    hyperparams: {},
    checkpoint_every: readNumber(form.checkpointEvery, "Intervalle de sauvegarde", positiveInteger),
    eval_every: readNumber(form.evalEvery, "Intervalle d’évaluation", positiveInteger),
    eval_episodes: readNumber(form.evalEpisodes, "Épisodes d’évaluation", positiveInteger),
  });
}
