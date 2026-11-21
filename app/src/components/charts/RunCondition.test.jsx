import { afterEach, describe, expect, it, vi } from "vitest";
import { identifyCondition, steeringPenalty } from "./RunCondition.jsx";

afterEach(() => vi.unstubAllGlobals());

describe("conditions des résultats", () => {
  it("lit la pénalité dans reward, y compris zéro avec un commentaire", () => {
    expect(steeringPenalty("reward:\r\n  lambda_steer: 0.0 # ablation\r\nenv:\r\n  lambda_steer: 1\r\n")).toBe(0);
    expect(steeringPenalty("reward:\n  k_progress: 0.1\nenv:\n  lambda_steer: 0")).toBeNull();
  });

  it("partage la lecture d’une configuration PPO fixe entre les évaluations et la progression", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "reward:\n  lambda_steer: 0\n" });
    vi.stubGlobal("fetch", fetch);
    const row = { run_id: "ppo_multi_mufixe_s0_20261121-0000", algo: "ppo", mu_mode: "fixed" };
    const sources = await Promise.all([identifyCondition(row, "server"), identifyCondition(row, "server")]);
    expect(sources.map(({ condition }) => condition)).toEqual(["ppo_mufixe_nolambda", "ppo_mufixe_nolambda"]);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`/files/runs/${row.run_id}/config.yaml`);
  });

  it.each([
    [{ run_id: "classic_ref", algo: null }, "classic"],
    [{ run_id: "fixture_b", algo: "classic" }, "classic"],
    [{ run_id: "ppo_multi", algo: "ppo", mu_mode: "uniform" }, "ppo_mualea"],
    [{ run_id: "fixture_a", algo: "ppo", mu_mode: "fixed" }, "ppo_mufixe"],
    [{ run_id: "sac_multi", algo: "sac", mu_mode: "fixed" }, "sac_mufixe"],
    [{ run_id: "sarsa_multi", algo: "sarsa", mu_mode: "fixed" }, "sarsa_mufixe"],
  ])("déduit la condition de %j", async (row, name) => {
    expect(await identifyCondition(row, "fixtures")).toMatchObject({ condition: name });
  });
});
