import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fitnessSyncConfigured, fitnessSyncTargetEmail, shouldSync, signBody } from "./fitnessSync.js";

/**
 * Contrat d'envoi vers l'app fitness (AC-KINETIK).
 *
 * Deux invariants seulement, mais les deux sont critiques parce que la poussée est
 * BEST-EFFORT : si elle casse, aucune pesée n'échoue et aucune alerte ne remonte — les
 * données cessent simplement d'arriver. Ces tests sont donc la seule chose qui se plaint.
 */

/** Restaure l'environnement après chaque scénario (les variables pilotent tout le module). */
function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const keys = ["FITNESS_SYNC_URL", "FITNESS_SYNC_SECRET", "FITNESS_SYNC_EMAILS", "FITNESS_SYNC_TARGET_EMAIL"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    for (const k of keys) delete process.env[k];
    for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
    fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k] as string;
    }
  }
}

const CONFIG = {
  FITNESS_SYNC_URL: "https://exemple.test/api/integrations/balance/weigh-in",
  FITNESS_SYNC_SECRET: "secret",
  FITNESS_SYNC_EMAILS: "Moi@Exemple.FR, autre@exemple.fr",
};

describe("signBody — contrat de signature avec AC-KINETIK", () => {
  /**
   * Vecteur de référence PARTAGÉ avec AC-KINETIK : le même triplet (secret, horodatage,
   * corps) doit produire exactement cette signature des deux côtés. Le test jumeau vit dans
   * salle-de-sport/tests/balanceIngest.test.ts, sur `expectedSignature()`.
   * ⚠️ Ne jamais « corriger » cette constante sans corriger l'autre dépôt : la faire diverger
   * revient à couper la synchronisation en silence.
   */
  const SECRET_REF = "secret-de-test-partage";
  const TS_REF = "1786788000000";
  const CORPS_REF =
    '{"email":"moi@exemple.fr","deleted":false,"measurementId":"11111111-1111-4111-8111-111111111111","weightKg":80.1}';
  const SIGNATURE_REF = "511d95ba84e97d2218ea3304c32155e066de6f395907e4b5faf53c932746ba8f";

  test("produit la signature de référence (identique côté AC-KINETIK)", () => {
    assert.equal(signBody(SECRET_REF, TS_REF, CORPS_REF), SIGNATURE_REF);
  });

  test("l'horodatage entre dans la signature (une trame rejouée ne se resigne pas)", () => {
    assert.notEqual(signBody(SECRET_REF, "1786788000001", CORPS_REF), SIGNATURE_REF);
  });

  test("un corps modifié change la signature", () => {
    assert.notEqual(signBody(SECRET_REF, TS_REF, CORPS_REF.replace("80.1", "65")), SIGNATURE_REF);
  });

  test("un secret différent change la signature", () => {
    assert.notEqual(signBody("autre-secret", TS_REF, CORPS_REF), SIGNATURE_REF);
  });
});

describe("fitnessSyncTargetEmail — compte destinataire", () => {
  /**
   * Les deux apps ont des comptes séparés : rien n'oblige à s'y être inscrit avec la même
   * adresse. Envoyer celle de l'ÉMETTEUR quand elle n'existe pas côté fitness faisait
   * silencieusement disparaître les pesées (l'app répond 202 applied:false).
   */
  test("vise l'adresse configurée, pas celle de l'émetteur", () => {
    withEnv({ ...CONFIG, FITNESS_SYNC_TARGET_EMAIL: "Mon.Compte@Fitness.FR" }, () => {
      assert.equal(fitnessSyncTargetEmail("moi@exemple.fr"), "mon.compte@fitness.fr");
    });
  });

  test("retombe sur l'adresse de l'émetteur si aucune cible n'est configurée", () => {
    withEnv(CONFIG, () => {
      assert.equal(fitnessSyncTargetEmail("Moi@Exemple.FR"), "moi@exemple.fr");
    });
  });
});

describe("shouldSync — liste blanche des comptes", () => {
  test("accepte un email déclaré, insensible à la casse et aux espaces", () => {
    withEnv(CONFIG, () => {
      assert.equal(shouldSync("moi@exemple.fr"), true);
      assert.equal(shouldSync("  MOI@EXEMPLE.FR  "), true);
      assert.equal(shouldSync("autre@exemple.fr"), true);
    });
  });

  test("refuse tout autre compte", () => {
    withEnv(CONFIG, () => {
      assert.equal(shouldSync("inconnu@exemple.fr"), false);
      assert.equal(shouldSync(""), false);
      assert.equal(shouldSync(undefined), false);
      assert.equal(shouldSync(null), false);
    });
  });

  test("refuse TOUT LE MONDE si une seule variable manque — jamais d'envoi à moitié configuré", () => {
    withEnv({ ...CONFIG, FITNESS_SYNC_SECRET: undefined }, () => {
      assert.equal(fitnessSyncConfigured(), false);
      assert.equal(shouldSync("moi@exemple.fr"), false);
    });
    withEnv({ ...CONFIG, FITNESS_SYNC_URL: undefined }, () => {
      assert.equal(shouldSync("moi@exemple.fr"), false);
    });
    withEnv({ ...CONFIG, FITNESS_SYNC_EMAILS: undefined }, () => {
      assert.equal(shouldSync("moi@exemple.fr"), false);
    });
  });

  test("intégration inactive par défaut (aucune variable définie)", () => {
    withEnv({}, () => {
      assert.equal(fitnessSyncConfigured(), false);
      assert.equal(shouldSync("moi@exemple.fr"), false);
    });
  });
});
