import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildTrainingYaml } from "../data/yaml.js";
import TrainingCenter, { estimateDuration, presetForm, runIdentity } from "./TrainingCenter.jsx";

const tracks = [
  { id: "demo_oval", name: "Ovale de démonstration", split: "demo" },
  ...Array.from({ length: 10 }, (_, i) => ({ id: `gen_0${i}`, split: "train" })),
  { id: "gen_10", split: "test" },
];

describe("centre d’entraînement", () => {
  it.each([
    ["quick", "ppo", 20_000, 1, "≈ 20 s"],
    ["ppo", "ppo", 200_000, 10, "≈ 3 min"],
    ["sac", "sac", 100_000, 10, "≈ 9 min"],
  ])("produit une configuration lançable pour le préréglage %s", (preset, algo, steps, count, eta) => {
    const form = presetForm(preset, tracks);
    expect(form).toMatchObject({ algo, totalSteps: steps });
    expect(form.trainTracks).toHaveLength(count);
    expect(form.trainTracks[0]).toBe(count === 1 ? "demo_oval" : "gen_00");
    expect(form.testTracks).toEqual(count === 1 ? ["demo_oval"] : ["gen_10"]);
    expect(buildTrainingYaml(form)).toContain(`total_steps: ${steps}`);
    expect(estimateDuration(algo, steps)).toBe(eta);
  });

  it("présente le lancement désactivé avec les données d’exemple", () => {
    const html = renderToStaticMarkup(<TrainingCenter mode="fixtures" />);
    expect(html).toMatch(/<button[^>]*class="primary"[^>]*disabled=""[^>]*>Lancer<\/button>/);
    expect(html).toContain("Le serveur d’entraînement est absent");
    expect(html).toContain("<summary");
  });

  it("retrouve le circuit et trie les dates indépendamment de l’ordre alphabétique des identifiants", () => {
    const oval = runIdentity({ run_id: "ppo_demo_oval_mufixe_s0_20261121-2224", algo: "ppo" }, tracks);
    const multi = runIdentity({ run_id: "sac_multi_mufixe_s0_20261121-0211", algo: "sac" }, tracks);
    expect(oval).toMatchObject({ algo: "PPO", circuits: "Ovale de démonstration", trackId: "demo_oval" });
    expect(multi.circuits).toBe("Plusieurs circuits");
    expect(oval.date.getTime()).toBeGreaterThan(multi.date.getTime());
  });
});
