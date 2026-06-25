import { describe, it, expect } from "vitest";
import {
  calculateAge,
  calculateBmi,
  calculateFfm,
  getBmiStatus,
  getFatStatus,
  getVisceralStatus,
} from "./bodyMetrics";

describe("calculateBmi", () => {
  it("calcule l'IMC à partir du poids et de la taille", () => {
    expect(calculateBmi(80, 180)).toBeCloseTo(24.69, 2);
  });
});

describe("calculateFfm", () => {
  it("soustrait la masse grasse du poids total", () => {
    expect(calculateFfm(80, 25)).toBeCloseTo(60, 5);
    expect(calculateFfm(100, 0)).toBe(100);
  });
});

describe("calculateAge", () => {
  it("compte une année de moins si l'anniversaire n'est pas atteint", () => {
    const ref = new Date("2026-06-25T12:00:00Z");
    expect(calculateAge("2000-06-25", ref)).toBe(26); // anniversaire atteint
    expect(calculateAge("2000-12-25", ref)).toBe(25); // pas encore
  });
});

describe("getBmiStatus", () => {
  it("classe l'IMC dans les bonnes catégories", () => {
    expect(getBmiStatus(17).cat).toBe("warning"); // maigreur
    expect(getBmiStatus(22).cat).toBe("success"); // normal
    expect(getBmiStatus(27).cat).toBe("warning"); // surpoids
    expect(getBmiStatus(32).cat).toBe("danger"); // obésité
  });
});

describe("getFatStatus", () => {
  it("applique des seuils différents selon le genre", () => {
    expect(getFatStatus(15, "male").cat).toBe("success");
    expect(getFatStatus(30, "male").cat).toBe("danger");
    expect(getFatStatus(15, "female").cat).toBe("warning"); // très faible chez la femme
    expect(getFatStatus(25, "female").cat).toBe("success");
  });
});

describe("getVisceralStatus", () => {
  it("classe le niveau de graisse viscérale", () => {
    expect(getVisceralStatus(5).cat).toBe("success");
    expect(getVisceralStatus(12).cat).toBe("warning");
    expect(getVisceralStatus(20).cat).toBe("danger");
  });
});
