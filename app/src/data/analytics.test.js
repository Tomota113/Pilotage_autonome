import { describe, expect, it } from "vitest";
import { evaluationRows, isF1Condition, summarizeCircuits, summarizeLapRatios, summarizeShowcase, summarizeTakeaways, summarizeTrials } from "./analytics.js";

const ppo = "ppo_f1_mualea";
const tabular = "sarsa_f1";
const trial = (condition, overrides = {}) => ({ condition, seed: 0, track_id: "f1_spa", split: "test", mu_factor: 1, outcome: "lap", ...overrides });

describe("résultats de la série v2", () => {
  it("distingue les conditions F1, y compris les variantes de PPO", () => {
    expect(["ppo_f1", "ppo_f1_net64", ppo, "deep_mc_f1", "ppo_mualea"].map(isF1Condition)).toEqual([true, true, true, true, false]);
  });

  it("compte les essais réellement présents, sans supposer trois graines ni compléter les cases manquantes", () => {
    const rows = evaluationRows([
      trial(ppo), trial(ppo, { mu_factor: "0.8", outcome: "off_track" }), trial(ppo, { seed: 1, outcome: "stalled" }),
      trial(ppo, { seed: 2, outcome: "timeout" }), trial(tabular, { outcome: "stalled" }),
      trial(undefined), trial(ppo, { mu_factor: "" }), trial(tabular, { outcome: "unexpected" }),
    ]);
    const entries = summarizeTrials(rows);
    expect(entries[0]).toMatchObject({ condition: ppo, attempts: 4, laps: 1, rate: 0.25,
      outcomes: { lap: 1, off_track: 1, stalled: 1, timeout: 1 } });
    expect(entries[0].seeds.map(({ seed, laps, attempts }) => [seed, laps, attempts])).toEqual([[0, 1, 2], [1, 0, 1], [2, 0, 1]]);
    expect(entries[0].byMu.get(0.8)).toMatchObject({ laps: 0, attempts: 1, rate: 0 });
    expect(entries[0].byMu.has(0.6)).toBe(false);
    expect(entries[1]).toMatchObject({ condition: tabular, attempts: 1, laps: 0, rate: 0 });
    const cells = summarizeCircuits(rows.filter(({ seed }) => seed === 0));
    expect(cells.get(ppo).get("f1_spa")).toMatchObject({ laps: 1, attempts: 2 });
    expect(cells.get(ppo).has("f1_monza")).toBe(false);
  });

  it("compare seulement les tours valides au classique du même circuit et de la même adhérence", () => {
    const rows = [
      trial("classic", { lap_time: 100 }), trial("classic", { lap_time: 200, mu_factor: 0.8 }),
      trial("classic", { lap_time: 200, track_id: "f1_monza", outcome: "off_track" }),
      trial(ppo, { lap_time: 160 }), trial(ppo, { lap_time: 100, mu_factor: 0.8 }),
      trial(ppo, { lap_time: 90, outcome: "off_track" }), trial(ppo, { lap_time: 130, track_id: "f1_monza" }),
      trial(ppo, { lap_time: "" }), trial(ppo, { lap_time: 1, mu_factor: 0.6 }),
    ];
    const ratios = summarizeLapRatios(rows);
    expect([...ratios.keys()]).toEqual([ppo]);
    expect(ratios.get(ppo).points.map(({ ratio }) => ratio)).toEqual([1.6, 0.5]);
    expect(ratios.get(ppo).median).toBe(1.05);
  });

  it("distingue l’entraînement de la démonstration générée et ignore les autres circuits", () => {
    const groups = summarizeShowcase([
      trial(ppo, { split: "train", track_id: "real_austin" }), trial(ppo, { split: "demo", track_id: "gen_f1_20", outcome: "timeout" }),
      trial(ppo, { split: "demo", track_id: "demo_oval" }), trial(ppo),
    ]);
    expect(groups.get("train")[0]).toMatchObject({ laps: 1, attempts: 1 });
    expect(groups.get("demo")[0]).toMatchObject({ laps: 0, attempts: 1 });
  });

  it("classe les agents par taux, gère les ex æquo et compte les références séparément", () => {
    const takeaways = summarizeTakeaways(summarizeTrials([
      trial(ppo), trial(ppo, { mu_factor: 0.6, outcome: "off_track" }), trial("tqc_f1"), trial("tqc_f1", { outcome: "stalled" }),
      trial(tabular, { mu_factor: 0.6, outcome: "stalled" }), trial("classic", { mu_factor: 0.6 }),
    ]));
    expect(takeaways.leaders.map(({ condition }) => condition)).toEqual([ppo, "tqc_f1"]);
    expect(takeaways).toMatchObject({ lowestMu: 0.6, agentsLow: { laps: 0, attempts: 2 },
      referencesLow: { laps: 1, attempts: 1 }, tabular: { laps: 0, attempts: 1 }, failures: [{ outcome: "stalled", count: 2 }] });
  });
});
