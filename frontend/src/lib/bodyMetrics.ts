// Fonctions PURES de métriques corporelles, partagées par l'UI (App, BiaChart…).
// Centralise les calculs auparavant dupliqués et les seuils de classification santé.

export type MetricCategory = "primary" | "success" | "warning" | "danger" | "info";

export interface StatusInfo {
  label: string;
  cat: MetricCategory;
}

/** Âge en années à partir d'une date de naissance "AAAA-MM-JJ". */
export function calculateAge(birthdateStr: string, now: Date = new Date()): number {
  const birthdate = new Date(birthdateStr);
  let age = now.getFullYear() - birthdate.getFullYear();
  const monthDiff = now.getMonth() - birthdate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthdate.getDate())) {
    age--;
  }
  return age;
}

/** Indice de masse corporelle. */
export function calculateBmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

/** Masse sans graisse (Fat-Free Mass) en kg, à partir du poids et du % de gras. */
export function calculateFfm(weightKg: number, fatPct: number): number {
  return weightKg - (weightKg * fatPct) / 100;
}

/** Classification de l'IMC. */
export function getBmiStatus(bmi: number): StatusInfo {
  if (bmi < 18.5) return { label: "Insuffisance pondérale", cat: "warning" };
  if (bmi < 25) return { label: "Poids normal (Excellent)", cat: "success" };
  if (bmi < 30) return { label: "Surpoids", cat: "warning" };
  return { label: "Obésité", cat: "danger" };
}

/** Classification du taux de masse grasse selon le genre. */
export function getFatStatus(fatPct: number, gender: string): StatusInfo {
  if (gender === "male") {
    if (fatPct < 10) return { label: "Taux très faible", cat: "warning" };
    if (fatPct < 20) return { label: "Taux sain (Idéal)", cat: "success" };
    if (fatPct < 25) return { label: "Moyen", cat: "warning" };
    return { label: "Excès de gras", cat: "danger" };
  }
  if (fatPct < 18) return { label: "Taux très faible", cat: "warning" };
  if (fatPct < 28) return { label: "Taux sain (Idéal)", cat: "success" };
  if (fatPct < 33) return { label: "Moyen", cat: "warning" };
  return { label: "Excès de gras", cat: "danger" };
}

/** Classification de la graisse viscérale (échelle de niveau). */
export function getVisceralStatus(level: number): StatusInfo {
  if (level <= 9) return { label: "Niveau sain (Faible risque)", cat: "success" };
  if (level <= 14) return { label: "Élevé (Prudence)", cat: "warning" };
  return { label: "Très élevé (Risque cardio)", cat: "danger" };
}
