// Fonctions PURES de métriques corporelles, partagées par l'UI (App, BiaChart…).
// Centralise les calculs auparavant dupliqués.
//
// Les SEUILS santé (quelle valeur est bonne / à surveiller) ne vivent PAS ici :
// ils sont tous dans lib/metricGuidance.ts, seule source de vérité.

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
