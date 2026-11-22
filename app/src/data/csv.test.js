import { describe, expect, it } from "vitest";
import { parseCSV } from "./csv.js";
import { aggregateEvaluation, aggregateLearning } from "./analytics.js";

describe("parseCSV", () => {
  it("lit les données numériques et conserve les champs vides et textuels (CRLF)", () => {
    const header = "run_id,algo,seed,mu_mode,step,mean_reward,lap_rate,mean_lap_time";
    const csv = `${header}\r\nppo_multi_mufixe_s0_20261120-2224,ppo,0,fixed,1000,-21.5,0,\r\n`;
    expect(parseCSV(csv)).toEqual([{
      run_id: "ppo_multi_mufixe_s0_20261120-2224", algo: "ppo", seed: 0, mu_mode: "fixed",
      step: 1000, mean_reward: -21.5, lap_rate: 0, mean_lap_time: "",
    }]);
  });

  it("lit le facteur d’adhérence, les sorties et le chemin du replay (LF)", () => {
    expect(parseCSV("mu_factor,offtracks,replay_path\n0.60,1,runs/r1/replays/example.json")).toEqual([
      { mu_factor: 0.6, offtracks: 1, replay_path: "runs/r1/replays/example.json" },
    ]);
  });

  it.each(["", "  \r\n", "run_id,step\n"])("renvoie zéro ligne pour %j", (text) => {
    expect(parseCSV(text)).toEqual([]);
  });
});

describe("agrégations de l’analyse", () => {
  const source = (seed, date, condition, values) => ({
    seed, run_id: `ppo_multi_mufixe_s${seed}_${date}`, condition,
    rows: values.map(([step, mean_reward]) => ({ step, mean_reward })),
  });

  it("regroupe par condition, garde la dernière date par graine et aligne les pas communs", () => {
    const entries = [
      source(0, "20260101-1000", "ppo_mufixe", [[100, 10]]),
      source(0, "20260102-1000", "ppo_mufixe", [[100, 4], [200, 8]]),
      source(1, "20260103-1000", "ppo_mufixe", [[100, 8], [200, ""], [300, 5]]),
      source(2, "20260103-1000", "ppo_mufixe_nolambda", [[100, 100]]),
    ];
    const [ppo, noPenalty] = aggregateLearning(entries, "mean_reward");
    expect(ppo.average).toEqual([{ x: 100, y: 6 }]);
    expect(ppo.seeds).toEqual([
      { name: "Graine 0", points: [{ x: 100, y: 4 }, { x: 200, y: 8 }] },
      { name: "Graine 1", points: [{ x: 100, y: 8 }, { x: 300, y: 5 }] },
    ]);
    expect(noPenalty.average).toEqual([{ x: 100, y: 100 }]);
  });

  it("pondère les graines également et ignore les temps des épisodes sans tour", () => {
    const rows = [
      { condition: "ppo_mufixe", split: "test", mu_factor: 1, seed: 0, outcome: "lap", lap_time: 40, offtracks: 0 },
      { condition: "ppo_mufixe", split: "test", mu_factor: 1, seed: 0, outcome: "lap", lap_time: 50, offtracks: 0 },
      { condition: "ppo_mufixe", split: "test", mu_factor: 1, seed: 1, outcome: "off_track", lap_time: "", offtracks: 1 },
      { condition: "classic", split: "test", mu_factor: 1, seed: 0, outcome: "lap", lap_time: 60, offtracks: 0 },
      { condition: "ppo_mufixe", split: "train", mu_factor: 1, seed: 0, outcome: "lap", lap_time: 35, offtracks: 0 },
      { condition: "ppo_mufixe", split: "test", mu_factor: 0.6, seed: 0, outcome: "off_track", lap_time: "", offtracks: 1 },
    ];
    const [ppo, classic, train, slippery] = aggregateEvaluation(rows);
    expect(ppo).toMatchObject({ rate: 0.5, min: 0, max: 1, lapTime: 45, offtracks: 0.5, seeds: 2, episodes: 3 });
    expect(classic).toMatchObject({ condition: "classic", rate: 1 });
    expect(train).toMatchObject({ split: "train", rate: 1 });
    expect(slippery).toMatchObject({ mu: 0.6, rate: 0, lapTime: null });
  });
});
