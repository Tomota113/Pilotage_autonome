import { describe, expect, it } from "vitest";
import { parseCSV } from "./csv.js";
import { aggregateEvaluation, aggregateLearning } from "../pages/Analytics.jsx";

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
  const source = (seed, date, noPenalty, values, track = "multi") => ({
    noPenalty,
    rows: values.map(([step, mean_reward, mean_lap_time]) => ({
      run_id: `ppo_${track}_mufixe_s${seed}_${date}`, algo: "ppo", mu_mode: "fixed", seed, step,
      mean_reward, mean_lap_time,
    })),
  });

  it("regroupe par condition, garde la dernière date par graine et aligne les pas communs", () => {
    const entries = [
      source(0, "20260101-1000", false, [[100, 10, ""]]),
      source(0, "20260102-1000", false, [[100, 4, ""], [200, 8, 20]]),
      source(1, "20260103-1000", false, [[100, 8, 30], [300, 5, 25]]),
      source(2, "20260103-1000", true, [[100, 100, 15]]),
      source(3, "20260103-1000", false, [[100, 40, 35]], "demo_oval"),
    ];
    const [group] = aggregateLearning(entries, "mean_reward");
    expect(aggregateLearning(entries, "mean_reward")).toHaveLength(3);
    expect(group.points).toEqual([{ step: 100, mean: 6, deviation: Math.sqrt(8), count: 2 }]);
    expect(aggregateLearning(entries, "mean_lap_time")[0].points[0]).toEqual({
      step: 100, mean: 30, deviation: 0, count: 1,
    });
  });

  it("pondère les graines également et ignore les temps des épisodes sans tour", () => {
    const rows = [
      { algo: "ppo", seed: 0, outcome: "lap", lap_time: 40, offtracks: 0 },
      { algo: "ppo", seed: 0, outcome: "lap", lap_time: 50, offtracks: 0 },
      { algo: "ppo", seed: 1, outcome: "off_track", lap_time: "", offtracks: 1 },
      { algo: "classic", seed: 0, outcome: "lap", lap_time: 60, offtracks: 0 },
    ];
    const [ppo, classic] = aggregateEvaluation(rows);
    expect(ppo.lap_rate.mean).toBe(50);
    expect(ppo.mean_lap_time).toEqual({ count: 1, mean: 45, deviation: 0 });
    expect(ppo.offtracks_per_ep.mean).toBe(0.5);
    expect(classic.algo).toBe("classic");
  });
});
