import { describe, expect, it } from "vitest";
import {
  denormalizeObservation, getActionMode, getObservationLabels, getPerception, getTrackHalfWidth,
  pedalValue, topActivations,
} from "./network.js";

describe("perception de la voiture", () => {
  it("adapte la portée et les libellés des deux horizons au modèle", () => {
    expect(getPerception("f1_2024").sensorRange).toBe(200);
    expect(getObservationLabels("f1_2024")).toHaveLength(12);
    expect(getObservationLabels("f1_2024").slice(-2)).toEqual(["Courbure à 50 m", "Courbure à 150 m"]);
    expect(getPerception("v1").sensorRange).toBe(100);
    expect(getObservationLabels("v1").slice(-2)).toEqual(["Courbure à 30 m", "Courbure à 80 m"]);
    expect(getObservationLabels("v1", 13).at(-1)).toBe("Adhérence");
  });

  it("convertit les entrées selon les échelles F1 et v1 sans décaler le zéro", () => {
    const obs = [0, 0.25, 0.5, 1, 0.5, 0.25, 0, 0.5, -0.25, -0.5, 0.5, -0.25, 0.6];
    const f1 = denormalizeObservation(obs, "f1_2024", 6);
    const v1 = denormalizeObservation(obs, "v1", 6);
    expect(f1.slice(0, 7).map(({ value }) => value)).toEqual([0, 50, 100, 200, 100, 50, 0]);
    expect(v1[3]).toEqual({ value: 100, unit: "m" });
    expect(f1[7].value).toBeCloseTo(172.8);
    expect(v1[7].value).toBeCloseTo(113.4);
    expect(f1[7].unit).toBe("km/h");
    expect(f1[8]).toEqual({ value: -45, unit: "°" });
    expect(f1[9]).toEqual({ value: -3, unit: "m" });
    expect(f1[10]).toEqual({ value: 0.05, unit: "m⁻¹" });
    expect(f1[11]).toEqual({ value: -0.025, unit: "m⁻¹" });
    expect(f1[12].value).toBeCloseTo(0.9);
  });

  it("interpole la demi-largeur sur le segment projeté et signale une largeur manquante", () => {
    const track = { centerline: [[0, 0], [10, 0], [10, 9], [0, 9]], width: [8, 16, 12, 8] };
    expect(getTrackHalfWidth(track, { x: 2.5, y: -1 })).toBe(5);
    expect(getTrackHalfWidth(track, { x: -1, y: 3 })).toBe(4);
    const obs = Array(10).fill(0.5);
    expect(denormalizeObservation(obs, "v1")[9]).toEqual({ value: null, unit: "m" });
    obs[9] = 0;
    expect(denormalizeObservation(obs, "v1")[9]).toEqual({ value: 0, unit: "m" });
  });
});

it("classe les neurones par amplitude, conserve leur signe et départage par numéro", () => {
  const values = [0.2, -0.9, 0.9, -0.4, 0.5];
  expect(topActivations(values, 3)).toEqual([
    { neuron: 2, value: -0.9 }, { neuron: 3, value: 0.9 }, { neuron: 5, value: 0.5 },
  ]);
  expect(values).toEqual([0.2, -0.9, 0.9, -0.4, 0.5]);
  expect(topActivations(Array(256).fill(0))).toHaveLength(10);
  expect(topActivations([])).toEqual([]);
  expect(topActivations(values, 0)).toEqual([]);
});

it("reconnaît la pédale, les commandes continues et les actions discrètes", () => {
  const ppo = (outputs) => ({ agent: { algo: "ppo" }, network: { layers: [12, 256, 256, outputs] } });
  expect(getActionMode(ppo(2))).toBe("pedal");
  expect(getActionMode(ppo(3))).toBe("continuous");
  for (const algo of ["dqn", "qrdqn", "deep_sarsa", "deep_mc", "qlearning"]) {
    expect(getActionMode({ agent: { algo } })).toBe("discrete9");
  }
  expect(getActionMode({ agent: { algo: "classic" } })).toBeNull();
  expect(pedalValue({ throttle: 0, brake: 0.65 })).toBe(-0.65);
  expect(pedalValue({ throttle: 0.4, brake: 0 })).toBe(0.4);
});
