import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateBia, type BiaInput } from "./biaCalculator.js";

const baseMale: BiaInput = {
  weightKg: 80,
  impedanceOhms: 500,
  ageYears: 30,
  gender: "male",
  heightCm: 180,
};

describe("calculateBia", () => {
  it("calcule un IMC exact à partir du poids et de la taille", () => {
    const { bmi } = calculateBia(baseMale);
    // 80 / (1.8 * 1.8) = 24.69
    assert.equal(bmi, 24.69);
  });

  it("renvoie toutes les métriques dans des bornes physiologiques (homme avec impédance)", () => {
    const r = calculateBia(baseMale);
    assert.ok(r.fatPct >= 3 && r.fatPct <= 50, `fatPct hors bornes: ${r.fatPct}`);
    assert.ok(r.musclePct >= 30 && r.musclePct <= 85, `musclePct hors bornes: ${r.musclePct}`);
    assert.ok(r.waterPct >= 35 && r.waterPct <= 75, `waterPct hors bornes: ${r.waterPct}`);
    assert.ok(r.boneMassKg >= 1 && r.boneMassKg <= 8, `boneMassKg hors bornes: ${r.boneMassKg}`);
    assert.ok(r.visceralFat >= 1 && r.visceralFat <= 30, `visceralFat hors bornes: ${r.visceralFat}`);
    assert.ok(Number.isInteger(r.bmr) && r.bmr > 0, `bmr invalide: ${r.bmr}`);
  });

  it("renvoie des métriques valides pour une femme avec impédance", () => {
    const r = calculateBia({ ...baseMale, gender: "female" });
    assert.ok(r.fatPct >= 8 && r.fatPct <= 55, `fatPct femme hors bornes: ${r.fatPct}`);
    assert.ok(Number.isFinite(r.waterPct) && Number.isFinite(r.musclePct));
    assert.ok(Number.isInteger(r.bmr) && r.bmr > 0);
  });

  it("produit des résultats différents selon le genre", () => {
    const male = calculateBia(baseMale);
    const female = calculateBia({ ...baseMale, gender: "female" });
    assert.notDeepEqual(male, female);
  });

  it("bascule sur la formule de repli quand l'impédance est absente (0)", () => {
    const r = calculateBia({ ...baseMale, impedanceOhms: 0 });
    assert.ok(Number.isFinite(r.fatPct));
    assert.ok(r.fatPct >= 3 && r.fatPct <= 60, `fatPct (repli) hors bornes: ${r.fatPct}`);
    assert.ok(Number.isInteger(r.bmr) && r.bmr > 0);
  });

  it("bascule sur la formule de repli quand l'impédance est aberrante (> 2000)", () => {
    const r = calculateBia({ ...baseMale, impedanceOhms: 5000 });
    assert.ok(Number.isFinite(r.fatPct) && r.fatPct >= 3 && r.fatPct <= 60);
  });

  it("masse osseuse STABLE : identique avec ou sans impédance (même poids)", () => {
    const withImp = calculateBia(baseMale).boneMassKg;
    const noImp = calculateBia({ ...baseMale, impedanceOhms: 0 }).boneMassKg;
    assert.equal(withImp, noImp);
  });

  it("masse osseuse quasi stable pour une petite variation de poids (±0,5 kg)", () => {
    const a = calculateBia({ ...baseMale, weightKg: 80.0 }).boneMassKg;
    const b = calculateBia({ ...baseMale, weightKg: 80.5 }).boneMassKg;
    // arrondie à 0,1 kg (l'affichage du graphique) -> doit être identique
    assert.equal(Math.round(a * 10), Math.round(b * 10));
  });

  it("augmente le taux de masse grasse quand l'impédance augmente (à profil constant)", () => {
    const low = calculateBia({ ...baseMale, impedanceOhms: 400 });
    const high = calculateBia({ ...baseMale, impedanceOhms: 700 });
    assert.ok(
      high.fatPct > low.fatPct,
      `attendu fat(700Ω)=${high.fatPct} > fat(400Ω)=${low.fatPct}`
    );
  });
});
