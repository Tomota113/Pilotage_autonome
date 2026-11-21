import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

it("ne demande ni trajectoire idéale ni résultats F1 en mode fixtures", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetch);
  const { loadF1Eval, loadF1EvalV2, loadRaceline } = await import("./api.js");

  await expect(loadRaceline("f1_monza", 1)).resolves.toBeNull();
  await expect(loadF1Eval()).resolves.toEqual([]);
  await expect(loadF1EvalV2()).resolves.toBeNull();
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/runs");
});

it("charge la trajectoire à l’adhérence demandée et lit le CSV F1", async () => {
  const line = { track_id: "f1_monza", mu: 0.8, points: [[0, 0], [1, 1]], speed: [25, 30], lap_time_s: 81, length_m: 5800 };
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json([]))
    .mockResolvedValueOnce(Response.json(line))
    .mockResolvedValueOnce(new Response("run_id,track_id,mu_factor,outcome,lap_time\nraceline_ref,f1_monza,0.8,lap,81"))
    .mockResolvedValueOnce(new Response("run_id,track_id,mu_factor,outcome,lap_time\nraceline_f1_ref,real_montreal,0.8,lap,72"));
  vi.stubGlobal("fetch", fetch);
  const { loadF1Eval, loadF1EvalV2, loadRaceline } = await import("./api.js");

  await expect(loadRaceline("f1_monza", 0.8, "f1_2024")).resolves.toEqual(line);
  await expect(loadF1Eval()).resolves.toEqual([
    { run_id: "raceline_ref", track_id: "f1_monza", mu_factor: 0.8, outcome: "lap", lap_time: 81 },
  ]);
  await expect(loadF1EvalV2()).resolves.toEqual([
    { run_id: "raceline_f1_ref", track_id: "real_montreal", mu_factor: 0.8, outcome: "lap", lap_time: 72 },
  ]);
  expect(fetch.mock.calls).toEqual([
    ["/runs"],
    ["/tracks/f1_monza/raceline?mu=0.8&car=f1_2024"],
    ["/files/results/eval_f1.csv"],
    ["/files/results/eval_f1_v2.csv"],
  ]);
});

it("renvoie une liste vide quand le serveur n’a pas encore de CSV F1", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json([]))
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetch);
  const { loadF1Eval, loadF1EvalV2 } = await import("./api.js");

  await expect(loadF1Eval()).resolves.toEqual([]);
  await expect(loadF1EvalV2()).resolves.toBeNull();
});
