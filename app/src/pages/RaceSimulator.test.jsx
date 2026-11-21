import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import RaceSimulator from "./RaceSimulator.jsx";

const data = vi.hoisted(() => ({ replays: [], playback: {} }));
vi.mock("../components/CarSelector.jsx", async (importOriginal) => ({
  ...(await importOriginal()),
  useCarReplays: () => ({ car: "f1_2024", replays: data.replays }),
}));
vi.mock("../playback.jsx", () => ({ usePlayback: () => data.playback, PlaybackControls: () => null }));
vi.mock("../components/TrackCanvas.jsx", () => ({
  default: ({ trails }) => <canvas data-speed-max={trails[0].speedColorMax} />,
  speedColor: () => "#000",
}));

it("affiche 345 km/h et une échelle F1 pour le replay de la voiture sélectionnée", () => {
  const entry = { path: "f1-replay", car: "f1_2024", condition: "ppo_f1", track_id: "real_montreal", mu_factor: 1 };
  const frame = { t: 1, x: 0, y: 0, v: 345 / 3.6, action: { steer: 0, throttle: 1, brake: 0 }, sensors_m: [200] };
  data.replays = [entry];
  data.playback = {
    entry, track: { name: "Montréal" }, index: 0,
    replay: { track_id: entry.track_id, mu_factor: 1, frames: [frame], summary: { outcome: "timeout" }, agent: {} },
  };

  const html = renderToStaticMarkup(<RaceSimulator />);
  expect(html).toContain('value="f1_2024" selected=""');
  expect(html).toContain("345 <small>km/h</small>");
  expect(html).toContain(">350</text>");
  expect(html).toContain('data-speed-max="96"');
  expect(html).toContain("≥ 200 m");

  data.replays = [];
  const empty = renderToStaticMarkup(<RaceSimulator />);
  expect(empty).toContain("Aucun replay pour cette voiture.");
  expect(empty).not.toContain("345 <small>km/h</small>");
});
