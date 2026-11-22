import { describe, expect, it } from "vitest";
import { progressTimeline } from "../../data/interpolate.js";
import { GRID_RELEASE_SECONDS, gridOffset, gridPose, gridSlot, rankRacers } from "./raceData.js";
import { broadcastFit } from "./trackArtwork.js";

function racer(condition, outcome, samples) {
  const frames = samples.map(([t, progress]) => ({ t, progress, x: 0, y: 0, v: 0, psi: 0 }));
  const end = frames.at(-1).t;
  return { condition, end, timeline: progressTimeline(frames),
    replay: { frames, summary: { outcome, lap_time: outcome === "lap" ? end : null } } };
}

describe("grille de départ", () => {
  it("place quinze voitures derrière la ligne, en quinconce selon le cap du circuit", () => {
    const frame = { x: 5, y: 10, psi: 0, v: 3, progress: 0 };
    const start = { x: 5, y: 10, heading: Math.PI / 2 };
    const field = Array.from({ length: 15 }, (_, index) => gridPose(frame, start, gridSlot(index), 0, 1));
    for (const [index, pose] of field.entries()) {
      expect(pose.y).toBeLessThan(start.y);
      expect(Math.sign(pose.x - start.x)).toBe(index % 2 ? 1 : -1);
      expect(pose.psi).toBeCloseTo(start.heading);
      if (index) expect(pose.y).toBeLessThan(field[index - 1].y);
    }
    expect(frame).toEqual({ x: 5, y: 10, psi: 0, v: 3, progress: 0 });
  });

  it("ramène progressivement la voiture à sa pose réelle en 1,5 seconde", () => {
    const frame = { x: 20, y: 0, psi: 0, v: 3, progress: 0.1 };
    const start = { x: 0, y: 0, heading: 0 };
    const slot = gridSlot(0);
    const initial = gridPose(frame, start, slot, 0, 2);
    const middle = gridPose(frame, start, slot, GRID_RELEASE_SECONDS / 2, 2);
    expect(initial.x).toBe(-slot.behind / 2);
    expect(middle.x).toBe((initial.x + frame.x) / 2);
    expect(middle.progress).toBe(frame.progress);
    expect(gridPose(frame, start, slot, GRID_RELEASE_SECONDS, 2)).toBe(frame);
  });

  it("cadre le circuit et les quinze positions sur les deux formats de projection", () => {
    const points = [[-20, 0], [0, 1000], [500, 1000], [490, -200]];
    const start = { x: 0, y: 0, heading: 0.1 };
    for (const [width, height] of [[920, 458], [1250, 710]]) {
      const view = broadcastFit(points, width, height, start, 15);
      const slots = Array.from({ length: 15 }, (_, index) => {
        const [x, y] = gridOffset(gridSlot(index), start.heading);
        return [start.x + x / view.scale, start.y + y / view.scale];
      });
      for (const point of [...points, ...slots]) {
        const [x, y] = view.toScreen(point);
        expect(x).toBeGreaterThan(18);
        expect(x).toBeLessThan(width - 18);
        expect(y).toBeGreaterThan(18);
        expect(y).toBeLessThan(height - 18);
        expect(view.toWorld([x, y])[0]).toBeCloseTo(point[0]);
        expect(view.toWorld([x, y])[1]).toBeCloseTo(point[1]);
      }
    }
  });
});

describe("tour de chronométrage", () => {
  const slow = racer("slow", "lap", [[0, 0], [10, 0.4], [20, 1]]);
  const fast = racer("fast", "lap", [[0, 0], [5, 0.4], [16, 1]]);
  const stopped = racer("stopped", "off_track", [[0, 0], [8, 0.98]]);
  const field = [slow, stopped, fast];

  it("part de la grille puis donne les écarts et les places gagnées", () => {
    expect(rankRacers(field, 0).map(({ condition, gained }) => [condition, gained]))
      .toEqual([["slow", 0], ["stopped", 0], ["fast", 0]]);
    const [leader, follower, out] = rankRacers(field, 10);
    expect(leader).toMatchObject({ condition: "fast", gained: 2, position: 1, gap: null });
    expect(follower).toMatchObject({ condition: "slow", gained: -1, position: 2, gap: 5 });
    expect(out).toMatchObject({ done: true, finished: false, position: 3, gap: null });
  });

  it("classe les tours terminés au chronomètre, garde une référence pour les pilotes en course", () => {
    const [leader, follower] = rankRacers(field, 16);
    expect(leader.finished).toBe(true);
    expect(follower.finished).toBe(false);
    expect(follower.gap).toBeCloseTo(4.4);
    expect(rankRacers(field, 20).map(({ condition, finished }) => [condition, finished]))
      .toEqual([["fast", true], ["slow", true], ["stopped", false]]);
  });

  it("n’extrapole pas la progression d’un leader quand son replay s’arrête", () => {
    const earlyLap = racer("short", "lap", [[0, 0], [10, 0.8]]);
    expect(rankRacers([earlyLap, slow], 18)[1].gap).toBeNull();
    expect(rankRacers([], 18)).toEqual([]);
  });
});

describe("grille le long du tracé", () => {
  it("place les voitures sur la ligne centrale, derrière la ligne de départ, même après un virage", async () => {
    const { gridTarget } = await import("./raceData.js");
    // Départ juste après un virage à gauche de 90° : la grille doit suivre le virage, pas une droite.
    const back = [{ x: 0, y: 0, dist: 0 }, { x: -10, y: 0, dist: 10 }, { x: -20, y: 0, dist: 20 },
      { x: -20, y: -10, dist: 30 }, { x: -20, y: -60, dist: 80 }, { x: -20, y: -200, dist: 220 }];
    const start = { x: 0, y: 0, heading: 0, back, halfWidth: 6 };
    for (let i = 0; i < 15; i += 1) {
      const p = gridTarget(start, gridSlot(i), 1);
      const onFirst = Math.abs(p.y) <= 3.61 && p.x <= 0 && p.x >= -20;
      const onSecond = Math.abs(p.x + 20) <= 3.61 && p.y <= 0;
      expect(onFirst || onSecond).toBe(true);
    }
  });
});
