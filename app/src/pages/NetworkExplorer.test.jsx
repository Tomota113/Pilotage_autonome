import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import NetworkExplorer, { describeFrame } from "./NetworkExplorer.jsx";

const data = vi.hoisted(() => ({ playback: {} }));
vi.mock("../playback.jsx", () => ({ usePlayback: () => data.playback, PlaybackControls: () => null }));
vi.mock("../components/ReplayPicker.jsx", () => ({
  ReplayFields: ({ autoSelect }) => <span>{autoSelect ? "Choix par le menu" : "Choix par l’explorateur"}</span>,
}));

const frame = {
  obs: [...Array(10).fill(0), -0.2, 0.4],
  action: { steer: -0.2, throttle: 0, brake: 0.7 },
  activations: [Array(64).fill(-0.1234), Array(64).fill(0.2)],
  sensors_m: Array(7).fill(10),
};

it("décrit la courbure à partir de son signe et le freinage à partir de la commande", () => {
  expect(describeFrame(frame)).toContain("gauche à 80 m. À cet instant, elle freine et braque à droite");
  expect(describeFrame({ ...frame, obs: [...frame.obs.slice(0, 11), 0] })).toContain("droite à 30 m");
});

it("affiche le schéma du replay sélectionné avec ses deux couches et les valeurs au survol", () => {
  const entry = { has_activations: true, run_id: "demo", track_id: "oval", mu_factor: 1, checkpoint: "step_20" };
  data.playback = { entry, replay: { ...entry, agent: { algo: "dqn", checkpoint: "step_20" }, frames: [frame] }, index: 0, speed: 1 };
  const html = renderToStaticMarkup(<NetworkExplorer />);
  expect(html).toContain("Choix par l’explorateur");
  expect(html).toContain("Distance au bord à −90°");
  expect(html).toContain("Couche 1 · neurone 64 · -0,1234");
  expect(html).toContain("Couche 2 · neurone 64 · 0,2");
  expect(html).toContain("DQN choisit parmi neuf actions possibles");
  expect(html.match(/<circle\b/g)).toHaveLength(143);
});

it.each(["dqn", "qrdqn", "deep_sarsa", "deep_mc"])("affiche les neuf scores et la commande enregistrée pour %s", (algo) => {
  const entry = { has_activations: true, path: "demo", car: "f1_2024" };
  const discrete = { ...frame, action: { steer: 0, throttle: 1, brake: 0 }, q_values: [1, 2, 3, 4, 5, 6, 7, 8, 9] };
  data.playback = { entry, replay: { ...entry, agent: { algo }, frames: [discrete] }, index: 0, speed: 1 };
  const html = renderToStaticMarkup(<NetworkExplorer />);
  const actions = html.match(/<ul class="network-actions">(.*?)<\/ul>/)[1];
  expect(actions.match(/class="network-bar"/g)).toHaveLength(9);
  expect(actions).toMatch(/aria-current="true"[^>]*>.*?Tout droit · Gaz/);
  expect(actions).not.toContain("—");

  data.playback.replay.frames = [frame];
  const withoutScores = renderToStaticMarkup(<NetworkExplorer />);
  expect(withoutScores).toContain("Scores Q non enregistrés");
  expect(withoutScores.match(/<ul class="network-actions">(.*?)<\/ul>/)[1].match(/—/g)).toHaveLength(9);
});
