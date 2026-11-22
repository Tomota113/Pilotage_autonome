import { describe, expect, it } from "vitest";
import { adjacentRacer } from "./Championship.jsx";

const standings = ["ppo", "dqn", "sac"].map((condition) => ({ condition }));

describe("sélection de la caméra dans le classement", () => {
  it("démarre en tête ou en queue depuis la vue d’ensemble", () => {
    expect(adjacentRacer(standings, null, 1)).toBe("ppo");
    expect(adjacentRacer(standings, null, -1)).toBe("sac");
  });

  it("boucle aux extrémités", () => {
    expect(adjacentRacer(standings, "sac", 1)).toBe("ppo");
    expect(adjacentRacer(standings, "ppo", -1)).toBe("sac");
  });

  it("utilise l’ordre courant et retrouve l’agent par son identifiant", () => {
    const reordered = [standings[2], standings[0], standings[1]];
    expect(adjacentRacer(reordered, "ppo", 1)).toBe("dqn");
    expect(adjacentRacer(reordered, "ppo", -1)).toBe("sac");
  });

  it("gère un agent masqué, un seul participant et un classement vide", () => {
    expect(adjacentRacer(standings.slice(1), "ppo", 1)).toBe("dqn");
    expect(adjacentRacer(standings.slice(0, 1), "ppo", -1)).toBe("ppo");
    expect(adjacentRacer([], "ppo", 1)).toBeNull();
  });
});
