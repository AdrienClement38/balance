import { describe, it, expect } from "vitest";
import { calculateAge, calculateBmi, calculateFfm } from "./bodyMetrics";

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
