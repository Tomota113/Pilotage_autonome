import { describe, expect, it } from "vitest";
import { createOvalTrack, resampleTrack, validateTrack } from "./trackValidation.js";

describe("validateTrack", () => {
  it("accepte un ovale, les bornes de μ et un départ décalé valide", () => {
    const track = createOvalTrack();
    track.mu[0] = 0.3;
    track.mu[1] = 1.5;
    expect(validateTrack(track)).toEqual([]);
    track.start.index = 1;
    track.checkpoints[0] = 1;
    track.length *= 1.0049;
    expect(validateTrack(track)).toEqual([]);
  });

  it.each([
    ["champ absent", (t) => { delete t.name; }, /Champ manquant/],
    ["schéma", (t) => { t.schema = "f1rl.track/2.0"; }, /Schéma/],
    ["identifiant", (t) => { t.id = "Oval-1"; }, /Identifiant/],
    ["nom", (t) => { t.name = ""; }, /nom/],
    ["split", (t) => { t.split = "validation"; }, /Split/],
    ["nombre de points", (t) => { t.centerline.length = 49; }, /au moins 50/],
    ["forme d’un point", (t) => { t.centerline[0] = [1, 2, 3]; }, /couples/],
    ["coordonnée", (t) => { t.centerline[0][1] = Infinity; }, /nombres finis/],
    ["longueur de width", (t) => { t.width.pop(); }, /même nombre/],
    ["longueur de mu", (t) => { t.mu.pop(); }, /même nombre/],
    ["largeur nulle", (t) => { t.width[0] = 0; }, /strictement positives/],
    ["largeur non numérique", (t) => { t.width[0] = "12"; }, /strictement positives/],
    ["μ trop bas", (t) => { t.mu[0] = 0.29; }, /comprises/],
    ["μ trop haut", (t) => { t.mu[0] = 1.51; }, /comprises/],
    ["μ non fini", (t) => { t.mu[0] = NaN; }, /comprises/],
    ["départ absent", (t) => { t.start = null; }, /départ/],
    ["indice de départ hors piste", (t) => { t.start.index = t.centerline.length; }, /indice entier/],
    ["indice de départ fractionnaire", (t) => { t.start.index = 1.5; }, /indice entier/],
    ["cap", (t) => { t.start.heading = null; }, /cap fini/],
    ["nombre de checkpoints", (t) => { t.checkpoints.pop(); }, /exactement 20/],
    ["checkpoint répété", (t) => { t.checkpoints[1] = t.checkpoints[0]; }, /strictement croissants/],
    ["checkpoint hors piste", (t) => { t.checkpoints[19] = t.centerline.length; }, /indices des checkpoints/],
    ["checkpoint fractionnaire", (t) => { t.checkpoints[1] = 6.5; }, /indices des checkpoints/],
    ["premier checkpoint", (t) => { t.checkpoints[0] = 1; }, /premier checkpoint/],
    ["fermeture répétée", (t) => { t.centerline[t.centerline.length - 1] = t.centerline[0]; }, /points consécutifs/],
    ["longueur", (t) => { t.length *= 1.0051; }, /boucle fermée/],
    ["longueur non finie", (t) => { t.length = Infinity; }, /boucle fermée/],
  ])("refuse la règle violée · %s", (_, change, problem) => {
    const track = createOvalTrack();
    change(track);
    expect(validateTrack(track)).toEqual(expect.arrayContaining([expect.stringMatching(problem)]));
  });

  it("rééchantillonne une boucle à environ 5 m en interpolant largeur et adhérence", () => {
    const track = createOvalTrack();
    track.width[0] = track.width[1] = 18;
    track.mu[0] = track.mu[1] = 0.3;
    track.mu[2] = 0.6;
    const result = resampleTrack(track);
    expect(validateTrack(result)).toEqual([]);
    expect(result.centerline[0]).toEqual(track.centerline[0]);
    expect(result.width[0]).toBe(18);
    expect(result.width[1]).toBeGreaterThan(12);
    expect(result.width[1]).toBeLessThan(18);
    expect(result.mu[1]).toBeGreaterThan(0.3);
    expect(result.mu[1]).toBeLessThan(0.6);
    expect(result.length / result.centerline.length).toBeGreaterThan(4.9);
    expect(result.length / result.centerline.length).toBeLessThanOrEqual(5);
  });
});
