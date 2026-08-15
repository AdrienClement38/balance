import { describe, it, expect } from "vitest";
import {
  getGuidance,
  GuidanceContext,
  MetricStatus,
  STATUS_CATEGORY,
  STATUS_COLORS,
} from "./metricGuidance";

// metricGuidance est désormais la SEULE table de seuils santé de l'app (le badge de
// la carte en dérive aussi) : ces tests verrouillent les bornes qui étaient jusqu'ici
// dupliquées, et donc contradictoires, dans bodyMetrics.

const homme: GuidanceContext = { gender: "male", age: 30, weightKg: 80 };
const femme: GuidanceContext = { gender: "female", age: 30, weightKg: 62 };

const status = (key: string, value: number, ctx: GuidanceContext) =>
  getGuidance(key, value, ctx)?.status;

describe("getGuidance — IMC", () => {
  it("classe l'IMC selon les seuils OMS", () => {
    expect(status("bmi", 17, homme)).toBe("warning"); // insuffisance pondérale
    expect(status("bmi", 22, homme)).toBe("good"); // normal
    expect(status("bmi", 27, homme)).toBe("warning"); // surpoids
    expect(status("bmi", 32, homme)).toBe("danger"); // obésité
  });
});

describe("getGuidance — masse grasse", () => {
  it("applique des seuils différents selon le sexe", () => {
    expect(status("fat", 5, homme)).toBe("warning"); // frôle la graisse essentielle
    expect(status("fat", 15, homme)).toBe("good");
    expect(status("fat", 22, homme)).toBe("ok"); // acceptable, PAS "moyen/à risque"
    expect(status("fat", 30, homme)).toBe("danger");

    expect(status("fat", 12, femme)).toBe("warning");
    expect(status("fat", 20, femme)).toBe("good");
    expect(status("fat", 28, femme)).toBe("ok");
    expect(status("fat", 35, femme)).toBe("danger");
  });

  it("tient les bornes exactes (24 % acceptable, 25 % excès chez l'homme)", () => {
    expect(status("fat", 24, homme)).toBe("ok");
    expect(status("fat", 25, homme)).toBe("danger");
  });
});

describe("getGuidance — graisse viscérale", () => {
  it("classe le niveau sur l'échelle balance", () => {
    expect(status("visceral", 5, homme)).toBe("good");
    expect(status("visceral", 12, homme)).toBe("good"); // borne haute de la zone saine
    expect(status("visceral", 13, homme)).toBe("warning");
    expect(status("visceral", 20, homme)).toBe("danger");
  });
});

describe("getGuidance — BMR", () => {
  it("reste neutre : aucun seuil clinique", () => {
    expect(status("bmr", 1200, homme)).toBe("ok");
    expect(status("bmr", 2400, homme)).toBe("ok");
  });
});

describe("getGuidance — cas limites", () => {
  it("renvoie null pour une métrique inconnue ou une valeur absente", () => {
    expect(getGuidance("inconnue", 42, homme)).toBeNull();
    expect(getGuidance("bmi", null, homme)).toBeNull();
    expect(getGuidance("bmi", undefined, homme)).toBeNull();
    expect(getGuidance("bmi", NaN, homme)).toBeNull();
  });
});

describe("STATUS_CATEGORY", () => {
  it("couvre tous les statuts, pour que le badge de carte ne soit jamais indéfini", () => {
    const statuses: MetricStatus[] = ["good", "ok", "warning", "danger"];
    for (const s of statuses) {
      expect(STATUS_CATEGORY[s]).toBeDefined();
      expect(STATUS_COLORS[s]).toBeDefined();
    }
  });
});
