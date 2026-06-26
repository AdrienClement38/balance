// Retour santé par métrique : évaluation de la valeur de l'utilisateur (bon / à
// surveiller), explication, et conseils d'amélioration.
//
// Le contenu (plages saines, explications, conseils) provient d'une recherche
// scientifique vérifiée par recoupement de sources autoritaires (OMS, ACSM, ACE,
// NIH/NIDDK, Cleveland Clinic, Mayo Clinic, Harvard Health, Tanita). Les seuils de
// masse musculaire suivent le cadre Janssen et al. (% du poids), et le BMR est
// présenté de façon NEUTRE car il n'a aucun seuil clinique « sain / à risque ».

export type MetricStatus = "good" | "ok" | "warning" | "danger";

export interface MetricGuidance {
  status: MetricStatus; // qualité de la valeur de l'utilisateur
  verdict: string; // libellé court, ex. "Excellent", "À surveiller"
  explanation: string; // ce que c'est + ce que signifie cette valeur
  tips: string[]; // comment l'améliorer / la maintenir
}

export const STATUS_COLORS: Record<MetricStatus, string> = {
  good: "#10b981", // emerald
  ok: "#6366f1", // indigo (neutre / correct)
  warning: "#f59e0b", // amber
  danger: "#f43f5e", // coral
};

export interface GuidanceContext {
  gender: "male" | "female";
  age: number;
  weightKg: number;
}

type EvalResult = { status: MetricStatus; verdict: string; comment: string };
interface MetricInfo {
  def: string; // contexte général (ce que c'est, pourquoi)
  tips: string[];
  evaluate: (value: number, ctx: GuidanceContext) => EvalResult;
}

const fmt = (v: number, d = 1) => (Number.isInteger(v) ? String(v) : v.toFixed(d));

const METRICS: Record<string, MetricInfo> = {
  // --- Indice de Masse Corporelle (OMS, seuils identiques H/F) ---
  bmi: {
    def: "L'IMC compare ton poids à ta taille. C'est un repère de dépistage : il ne distingue pas le muscle de la graisse, donc à compléter par le tour de taille.",
    tips: [
      "150 à 300 min d'activité modérée par semaine (marche rapide, vélo, natation) + 2 séances de renforcement.",
      "Plus de légumes, fruits, légumineuses et céréales complètes ; moins de boissons sucrées, d'ultra-transformés et d'alcool.",
      "Vise des changements progressifs (0,5 à 1 kg/semaine si perte) et dors 7 à 9 h.",
    ],
    evaluate: (v) => {
      const s = fmt(v);
      if (v < 18.5)
        return { status: "warning", verdict: "Insuffisance pondérale", comment: `Ton IMC de ${s} est sous 18,5 : possible insuffisance pondérale.` };
      if (v < 25)
        return { status: "good", verdict: "Corpulence normale", comment: `Ton IMC de ${s} est dans la zone normale (18,5–24,9). 👍` };
      if (v < 30)
        return { status: "warning", verdict: "Surpoids", comment: `Ton IMC de ${s} est dans la zone de surpoids (25–29,9).` };
      return { status: "danger", verdict: "Obésité", comment: `Ton IMC de ${s} correspond à une obésité (≥ 30), associée à un risque accru (diabète, cœur).` };
    },
  },

  // --- Masse grasse (% — ACE/ACSM, par sexe ; les plages saines montent avec l'âge) ---
  fat: {
    def: "La masse grasse est la part de ton poids faite de graisse. Une part est vitale ; l'excès (surtout abdominal) augmente les risques cardio-métaboliques. Les valeurs saines montent un peu avec l'âge.",
    tips: [
      "≥ 150 min d'endurance/semaine + 2 séances de renforcement pour préserver le muscle.",
      "Mise sur protéines, légumes et fibres ; limite sucres ajoutés et produits ultra-transformés.",
      "Sommeil (7–9 h) et gestion du stress : leur manque favorise le stockage abdominal.",
    ],
    evaluate: (v, { gender }) => {
      const s = fmt(v);
      if (gender === "male") {
        if (v < 6) return { status: "warning", verdict: "Très basse", comment: `À ${s} %, tu frôles la graisse essentielle (2–5 %) : trop bas peut perturber hormones et immunité.` };
        if (v <= 17) return { status: "good", verdict: "Athlétique / forme", comment: `${s} % est une excellente valeur (athlète/forme) pour un homme.` };
        if (v <= 24) return { status: "ok", verdict: "Acceptable", comment: `${s} % est dans la zone acceptable pour un homme (18–24 %).` };
        return { status: "danger", verdict: "Excès de gras", comment: `${s} % dépasse le seuil d'obésité (≥ 25 %) chez l'homme.` };
      }
      if (v < 14) return { status: "warning", verdict: "Très basse", comment: `À ${s} %, tu frôles la graisse essentielle (10–13 %) : trop bas peut perturber hormones et cycle.` };
      if (v <= 24) return { status: "good", verdict: "Athlétique / forme", comment: `${s} % est une excellente valeur (athlète/forme) pour une femme.` };
      if (v <= 31) return { status: "ok", verdict: "Acceptable", comment: `${s} % est dans la zone acceptable pour une femme (25–31 %).` };
      return { status: "danger", verdict: "Excès de gras", comment: `${s} % dépasse le seuil d'obésité (≥ 32 %) chez la femme.` };
    },
  },

  // --- Masse musculaire (% du poids — cadre Janssen, plages VÉRIFIÉES/corrigées) ---
  muscle: {
    def: "La masse musculaire (% du poids) reflète tes muscles. Plus de muscle = meilleure sensibilité à l'insuline et protection contre la sarcopénie. La bio-impédance la surestime : suis surtout la tendance.",
    tips: [
      "Renforcement musculaire 2 à 3×/semaine sur les grands groupes : le levier le plus efficace.",
      "Protéines réparties sur la journée (~1 à 1,3 g/kg/jour, soit 20–35 g par repas).",
      "Bouge au quotidien (marche, escaliers) et limite la sédentarité, qui accélère la fonte.",
    ],
    evaluate: (v, { gender }) => {
      const s = fmt(v);
      const seuils = gender === "male" ? { bon: 33, bas: 31 } : { bon: 28, bas: 23 };
      if (v >= seuils.bon) return { status: "good", verdict: "Bonne musculature", comment: `${s} % est une bonne masse musculaire pour ${gender === "male" ? "un homme" : "une femme"}.` };
      if (v >= seuils.bas) return { status: "ok", verdict: "Un peu basse", comment: `${s} % est un peu basse — à surveiller, surtout avec l'âge. Renforce le muscle.` };
      return { status: "warning", verdict: "Basse", comment: `${s} % est basse (repère évocateur de sarcopénie). Renforce le muscle et soigne les protéines.` };
    },
  },

  // --- Eau corporelle totale (% — InBody/Withings, par sexe) ---
  water: {
    def: "L'eau corporelle (% du poids) suit surtout ta masse maigre : le muscle est très riche en eau. Une valeur basse peut signaler une déshydratation ou trop de graisse ; très haute, une rétention d'eau.",
    tips: [
      "Bois régulièrement (apport total ≈ 3,7 L/j homme, 2,7 L/j femme, aliments inclus).",
      "Développe ta masse musculaire : plus de muscle = plus d'eau corporelle.",
      "Mange des fruits/légumes riches en eau et mesure-toi toujours dans les mêmes conditions.",
    ],
    evaluate: (v, { gender }) => {
      const s = fmt(v);
      const lo = gender === "male" ? 50 : 45;
      const hi = gender === "male" ? 65 : 60;
      if (v < lo) return { status: "warning", verdict: "Basse", comment: `${s} % est sous la zone saine (${lo}–${hi} %) : hydrate-toi mieux, ou c'est le signe de plus de masse grasse.` };
      if (v > hi) return { status: "warning", verdict: "Élevée", comment: `${s} % dépasse la zone saine (${lo}–${hi} %) : peut traduire une rétention d'eau.` };
      return { status: "good", verdict: "Bonne hydratation", comment: `${s} % est dans la zone saine (${lo}–${hi} %). 👍` };
    },
  },

  // --- Masse osseuse (kg — référence Tanita par poids/sexe ; estimation, pas un DEXA) ---
  bone: {
    def: "La masse osseuse estimée par la balance n'est qu'une approximation (pas une densité osseuse / DEXA). Elle bouge peu et dépend surtout de ton poids et de ton sexe.",
    tips: [
      "Activités en charge + renforcement 3 à 4 j/semaine (marche rapide, course, danse, musculation).",
      "Calcium ~1000–1200 mg/j (laitages, sardines, tofu, légumes verts) et vitamine D ~600–800 UI/j.",
      "Évite le tabac et limite l'alcool, deux accélérateurs de perte osseuse.",
    ],
    evaluate: (v, { gender, weightKg }) => {
      const s = fmt(v, 2);
      let ref: number;
      if (gender === "male") ref = weightKg < 65 ? 2.66 : weightKg <= 95 ? 3.29 : 3.69;
      else ref = weightKg < 50 ? 1.95 : weightKg <= 75 ? 2.4 : 2.9;
      if (v >= ref * 0.9)
        return { status: "good", verdict: "Conforme à l'attendu", comment: `${s} kg est cohérent avec l'attendu (~${ref} kg) pour ton poids et ton sexe.` };
      return { status: "ok", verdict: "Un peu sous l'attendu", comment: `${s} kg est sous l'attendu (~${ref} kg). Mais la bio-impédance est peu fiable pour l'os : seul un examen DEXA fait foi.` };
    },
  },

  // --- Graisse viscérale (niveau échelle balance, type Tanita 1–59 ; identique H/F) ---
  visceral: {
    def: "La graisse viscérale entoure les organes de l'abdomen. En excès, elle est très liée au diabète de type 2, à l'hypertension et aux maladies cardiovasculaires — même à poids normal.",
    tips: [
      "≥ 30 min d'activité 5 j/semaine (cardio + renforcement) : elle fond plus vite que la graisse sous-cutanée.",
      "Alimentation type méditerranéenne/DASH ; limite sucres raffinés, boissons sucrées et alcool.",
      "Sommeil 7–9 h et gestion du stress ; surveille aussi ton tour de taille (> 102 cm H / 88 cm F = alerte).",
    ],
    evaluate: (v) => {
      const s = fmt(v, 0);
      if (v <= 12) return { status: "good", verdict: "Niveau sain", comment: `Niveau ${s} : dans la zone saine (1–12). 👍` };
      if (v <= 19) return { status: "warning", verdict: "Élevé", comment: `Niveau ${s} : élevé (13–19). À faire baisser par l'activité et l'alimentation.` };
      return { status: "danger", verdict: "Très élevé", comment: `Niveau ${s} : très élevé (≥ 20), risque cardio-métabolique. Une prise en charge est recommandée.` };
    },
  },

  // --- Métabolisme de base (kcal — NEUTRE : aucun seuil clinique sain/à risque) ---
  bmr: {
    def: "Le métabolisme de base est l'énergie brûlée au repos (≈ 60–70 % de tes dépenses). Il n'a pas de seuil « bon/mauvais » : il dépend surtout de ta taille, de ta masse musculaire, de ton sexe et de ton âge.",
    tips: [
      "Renforcement musculaire ≥ 2×/semaine : le muscle brûle des calories même au repos.",
      "Assez de protéines à chaque repas pour préserver le muscle, surtout en cas de perte de poids.",
      "Évite les régimes très restrictifs ou le jeûne prolongé, qui ralentissent le métabolisme.",
    ],
    evaluate: (v, { gender }) => {
      const s = fmt(v, 0);
      const moy = gender === "male" ? 1696 : 1410;
      return {
        status: "ok",
        verdict: "À titre indicatif",
        comment: `${s} kcal/jour au repos (moyenne adulte ≈ ${moy} kcal/j). Une valeur plus haute reflète surtout plus de muscle ; suis surtout son évolution.`,
      };
    },
  },
};

/**
 * Construit le retour santé d'une métrique pour la valeur de l'utilisateur.
 * Renvoie null si la métrique est inconnue ou la valeur absente/invalide.
 */
export function getGuidance(
  key: string,
  value: number | null | undefined,
  ctx: GuidanceContext
): MetricGuidance | null {
  const info = METRICS[key];
  if (!info || value == null || !Number.isFinite(value)) return null;
  const { status, verdict, comment } = info.evaluate(value, ctx);
  return { status, verdict, explanation: `${comment} ${info.def}`, tips: info.tips };
}
