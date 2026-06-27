-- Recalcul rétroactif de la masse osseuse sur tout l'historique.
-- Avant : valeur instable (% de la masse maigre, formule différente avec/sans
-- impédance) -> zigzag d'une pesée à l'autre. Maintenant : estimation STABLE à
-- partir du sexe + poids uniquement (identique à estimateBoneMassKg côté backend).
-- Ne modifie QUE la colonne bone_mass_kg ; poids, impédance et autres métriques
-- restent intacts.
UPDATE "measurements" AS m
SET "bone_mass_kg" = ROUND(
  LEAST(5, GREATEST(1,
    CASE WHEN p."gender" = 'male'
         THEN 0.0215 * m."weight_kg" + 1.44
         ELSE 0.0238 * m."weight_kg" + 0.88
    END
  ))::numeric, 2)
FROM "profiles" AS p
WHERE m."profile_id" = p."id";
