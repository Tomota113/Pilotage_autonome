import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import NetworkExplorer, { describeFrame } from "./NetworkExplorer.jsx";

const data = vi.hoisted(() => ({ playback: {} }));
vi.mock("../playback.jsx", () => ({ usePlayback: () => data.playback, PlaybackControls: () => null }));
vi.mock("../components/ReplayPicker.jsx", () => ({
  default: ({ onlyWithActivations }) => <span>{onlyWithActivations ? "Replays avec activations" : "Tous les replays"}</span>,
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
  data.playback = { entry, replay: { ...entry, agent: { algo: "dqn", checkpoint: "step_20" }, frames: [frame] }, index: 0 };
  const html = renderToStaticMarkup(<NetworkExplorer />);
  expect(html).toContain("Replays avec activations");
  expect(html).toContain("Distance au bord à −90°");
  expect(html).toContain("Couche 1 · neurone 64 · -0,1234");
  expect(html).toContain("Couche 2 · neurone 64 · 0,2");
  expect(html).toContain("DQN choisit parmi neuf actions possibles");
  expect(html.match(/<circle\b/g)).toHaveLength(143);
});
