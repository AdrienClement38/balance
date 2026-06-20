export interface BiaInput {
  weightKg: number;
  impedanceOhms: number;
  ageYears: number;
  gender: "male" | "female";
  heightCm: number;
}

export interface BiaResult {
  bmi: number;
  fatPct: number;
  musclePct: number;
  waterPct: number;
  boneMassKg: number;
  bmr: number;
  visceralFat: number;
}

/**
 * Calcule la composition corporelle à partir du poids, de l'impédance et du profil utilisateur.
 * Utilise des formules empiriques de régression BIA (Bioelectrical Impedance Analysis) standards.
 */
export function calculateBia(input: BiaInput): BiaResult {
  const { weightKg, impedanceOhms, ageYears, gender, heightCm } = input;

  // 1. Calcul du BMI
  const heightM = heightCm / 100;
  const bmi = Number((weightKg / (heightM * heightM)).toFixed(2));

  // Si l'impédance n'est pas mesurée ou invalide, on retourne des calculs basiques sans impédance
  if (impedanceOhms <= 0 || impedanceOhms > 2000) {
    // Fallback standard basé sur l'âge/poids/genre (Formule de Deurenberg pour la graisse %)
    const genderFactor = gender === "male" ? 1 : 0;
    const fatPct = Number(
      (1.20 * bmi + 0.23 * ageYears - 10.8 * genderFactor - 5.4).toFixed(2)
    );
    const waterPct = Number(((100 - fatPct) * 0.73).toFixed(2));
    const musclePct = Number(((100 - fatPct) * 0.8).toFixed(2));
    const boneMassKg = Number((weightKg * (gender === "male" ? 0.045 : 0.04)).toFixed(2));
    const visceralFat = Math.max(1, Math.round(0.2 * fatPct + 0.1 * bmi - 3));
    const bmr = calculateBmr(weightKg, heightCm, ageYears, gender);

    return {
      bmi,
      fatPct: Math.max(3, Math.min(60, fatPct)),
      musclePct,
      waterPct,
      boneMassKg,
      bmr,
      visceralFat,
    };
  }

  // 2. Calcul du volume d'eau totale (Total Body Water - TBW) en Litres
  // Utilisation des équations de Kushner ajustées
  const heightSquared = heightCm * heightCm;
  const impedanceIndex = heightSquared / impedanceOhms;
  
  let tbw = 0;
  if (gender === "male") {
    tbw = 0.372 * impedanceIndex + 0.142 * weightKg + 0.079 * ageYears + 3.05;
  } else {
    tbw = 0.372 * impedanceIndex + 0.142 * weightKg + 0.079 * ageYears + 3.05; // Fallback
    // Ajustement femelle
    tbw = 0.305 * impedanceIndex + 0.154 * weightKg + 0.326;
  }

  // Pourcentage d'eau
  let waterPct = (tbw / weightKg) * 100;
  if (waterPct < 35) waterPct = 35;
  if (waterPct > 75) waterPct = 75;

  // 3. Calcul de la Masse Maigre (Fat-Free Mass - FFM)
  // L'eau représente environ 73.2% de la masse maigre en moyenne clinique.
  const ffm = tbw / 0.732;

  // 4. Calcul de la Masse Grasse (Fat Mass - FM)
  const fm = Math.max(2, weightKg - ffm);
  let fatPct = (fm / weightKg) * 100;
  
  // Limites physiques
  if (gender === "male") {
    if (fatPct < 3) fatPct = 3;
    if (fatPct > 50) fatPct = 50;
  } else {
    if (fatPct < 8) fatPct = 8;
    if (fatPct > 55) fatPct = 55;
  }

  // 5. Calcul de la Masse Osseuse (Bone Mass)
  let boneMassKg = 0;
  if (gender === "male") {
    boneMassKg = ffm * 0.045; // ~4.5% de la masse maigre
  } else {
    boneMassKg = ffm * 0.040; // ~4% de la masse maigre
  }
  // Limites
  if (boneMassKg < 1) boneMassKg = 1;
  if (boneMassKg > 8) boneMassKg = 8;

  // 6. Calcul de la Masse Musculaire (Muscle Mass)
  // La masse musculaire représente la masse maigre moins les os et l'eau extra-cellulaire non musculaire.
  const muscleMass = ffm - boneMassKg;
  let musclePct = (muscleMass / weightKg) * 100;
  if (musclePct < 30) musclePct = 30;
  if (musclePct > 85) musclePct = 85;

  // 7. Calcul de la Graisse Viscérale (échelle de 1 à 30)
  const visceralFat = Math.max(
    1,
    Math.min(
      30,
      Math.round(0.25 * fatPct + 0.12 * bmi - 4.5)
    )
  );

  // 8. Calcul du BMR (Métabolisme de Base)
  const bmr = calculateBmr(weightKg, heightCm, ageYears, gender);

  return {
    bmi,
    fatPct: Number(fatPct.toFixed(2)),
    musclePct: Number(musclePct.toFixed(2)),
    waterPct: Number(waterPct.toFixed(2)),
    boneMassKg: Number(boneMassKg.toFixed(2)),
    bmr,
    visceralFat,
  };
}

/**
 * Calcule le métabolisme de base (BMR) en Kcal en utilisant l'équation révisée de Harris-Benedict.
 */
function calculateBmr(weight: number, height: number, age: number, gender: "male" | "female"): number {
  if (gender === "male") {
    return Math.round(88.362 + 13.397 * weight + 4.799 * height - 5.677 * age);
  } else {
    return Math.round(447.593 + 9.247 * weight + 3.098 * height - 4.33 * age);
  }
}
