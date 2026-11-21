import { describe, expect, it } from "vitest";
import { identifyF1Rows, lapTimeGap } from "./f1.js";

describe("écart au temps idéal", () => {
  it("compare le temps au tour à la référence, avec le signe de l’écart", () => {
    expect(lapTimeGap(90, 80)).toBe(0.125);
    expect(lapTimeGap("76", 80)).toBe(-0.05);
    expect(lapTimeGap(80, 80)).toBe(0);
  });

  it.each([null, undefined, "", 0, -1, "invalide", Infinity])("ignore les temps inutilisables (%s)", (value) => {
    expect(lapTimeGap(value, 80)).toBeNull();
    expect(lapTimeGap(80, value)).toBeNull();
  });
});

it("associe les résultats F1 aux deux pilotes de référence et aux conditions de /runs", () => {
  const rows = ["classic_ref", "raceline_ref", "agent_1", "agent_2", "inconnu"].map((run_id) => ({
    run_id, track_id: "f1_monza", algo: "ppo",
  }));
  const runs = [
    { run_id: "agent_1", condition: "ppo_mufixe" },
    { run_id: "agent_2", condition: "ppo_mualea" },
  ];

  expect(identifyF1Rows(rows, runs)).toEqual(rows.map((row, index) => ({
    ...row, condition: ["classic", "raceline", "ppo_mufixe", "ppo_mualea", undefined][index],
  })));
});
