import { expect, it } from "vitest";
import { frameIndexAt, gapAtProgress, interpolateFrame, passageAt, progressTimeline } from "./interpolate.js";

const frames = [
  { t: 0.05, x: 0, y: 20, v: 10, progress: 0.2, psi: 0, checkpoint: 3, off_track: false, sensors_m: [10] },
  { t: 0.1, x: 8, y: 12, v: 30, progress: 0.6, psi: 1, checkpoint: 4, off_track: true, sensors_m: [5] },
];

it("interpole la pose et la progression entre les horodatages du replay", () => {
  const frame = interpolateFrame(frames, 0.075);
  expect(frame.t).toBe(0.075);
  expect(frame.x).toBeCloseTo(4);
  expect(frame.y).toBeCloseTo(16);
  expect(frame.v).toBeCloseTo(20);
  expect(frame.progress).toBeCloseTo(0.4);
  expect(frame.psi).toBeCloseTo(0.5);
  expect(frame.checkpoint).toBe(3);
  expect(frame.off_track).toBe(false);
  expect(frame.sensors_m).toBe(frames[0].sensors_m);
});

it("borne le temps et conserve les images exactes aux horodatages enregistrés", () => {
  const later = { ...frames[1], t: 0.15 };
  const replay = [...frames, later];
  expect(interpolateFrame(replay, 0)).toBe(frames[0]);
  expect(interpolateFrame(replay, 0.1)).toBe(frames[1]);
  expect(interpolateFrame(replay, 0.15)).toBe(later);
  expect(interpolateFrame(replay, 4)).toBe(later);
  expect(interpolateFrame([later], 0)).toBe(later);
  expect(frameIndexAt(replay, 0.099)).toBe(0);
  expect(frameIndexAt(replay, 0.1)).toBe(1);
  expect(frameIndexAt(replay, 0.149)).toBe(1);
  expect(frameIndexAt(replay, 0.15)).toBe(2);
});

it.each([1, -1])("franchit ±π par le plus court chemin dans le sens %i", (direction) => {
  const from = { ...frames[0], psi: direction * (Math.PI - 0.1) };
  const to = { ...frames[1], psi: -direction * (Math.PI - 0.1) };
  expect(interpolateFrame([from, to], 0.075).psi).toBeCloseTo(direction * Math.PI);
});

it("calcule l’écart au fantôme au même point avec les vrais horodatages", () => {
  const timeline = progressTimeline([{ t: 0, progress: 0 }, { t: 4, progress: 0.3 }, { t: 10, progress: 0.9 }]);
  expect(gapAtProgress({ t: 8, progress: 0.6 }, timeline)).toBeCloseTo(1);
  expect(gapAtProgress({ t: 6, progress: 0.6 }, timeline)).toBeCloseTo(-1);
  expect(gapAtProgress({ t: 10, progress: 0.9 }, timeline)).toBe(0);
  expect(gapAtProgress({ t: 14, progress: 1 }, timeline)).toBeNull();
  expect(gapAtProgress({ t: 0, progress: -0.1 }, timeline)).toBeNull();
  expect(gapAtProgress({ t: 0, progress: 0 }, [])).toBeNull();
});

it("conserve le premier passage puis interpole la reprise après un recul et un palier", () => {
  const timeline = progressTimeline([
    { t: 0, progress: 0 }, { t: 1, progress: 0.2 }, { t: 4, progress: 0.2 },
    { t: 5, progress: 0.1 }, { t: 6, progress: 0.3 },
  ]);
  expect(passageAt(timeline, 0.2)).toMatchObject({ time: 1, index: 1 });
  expect(passageAt(timeline, 0.25)).toMatchObject({ time: 5.75, index: 4 });
});
