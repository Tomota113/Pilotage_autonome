import { describe, expect, it } from "vitest";
import { buildTrainingYaml, TRAINING_DEFAULTS } from "./yaml.js";

const form = { ...TRAINING_DEFAULTS, trainTracks: ["test-01", "01"], testTracks: ["yes"] };

describe("buildTrainingYaml", () => {
  it.each([
    ["ppo", "continuous"], ["sac", "continuous"], ["dqn", "discrete9"], ["qlearning", "discrete9"],
    ["sarsa", "discrete9"], ["montecarlo", "discrete9"],
  ])("déduit l’espace d’actions de %s", (algo, space) => {
    const yaml = buildTrainingYaml({ ...form, algo });
    expect(yaml).toContain('schema: "f1rl.config/1.3"\n');
    expect(yaml).toContain(`algo: "${algo}"\n`);
    expect(yaml).toContain(`  action_space: "${space}"\n`);
    expect(yaml).toContain('  train: ["test-01", "01"]\n  test: ["yes"]\n');
    expect(yaml).toContain("  observe_mu: false\n");
    expect(yaml).toContain("hyperparams: {}\n");
  });

  it("encode les petits réels et utilise les valeurs du mode actif", () => {
    const yaml = buildTrainingYaml({ ...form, muMode: "uniform", muValue: "", muMin: 1e-7, muMax: 2 });
    expect(yaml).toContain('  mode: "uniform"\n  value: 1\n  range: [1.0e-7, 2]\n');
  });

  it.each([
    { seed: -1 }, { seed: "" }, { totalSteps: 1.5 }, { trainTracks: [] },
    { muMode: "uniform", muMin: 1.3, muMax: 1.2 }, { muValue: 0 },
    { evalEpisodes: 0 }, { checkpointEvery: "" }, { algo: "classic" },
  ])("refuse %j", (changes) => {
    expect(() => buildTrainingYaml({ ...form, ...changes })).toThrow();
  });
});
