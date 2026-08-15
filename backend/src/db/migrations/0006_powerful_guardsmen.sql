ALTER TABLE "measurements" ADD COLUMN "fitness_sync_skipped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Rattrapage de la migration 0005.
--
-- 0005 avait sorti l'historique de la file d'attente en le marquant « synchronisé »
-- (fitness_synced_at = created_at). C'était sans conséquence tant que la colonne ne servait
-- qu'à la file. Mais elle fait désormais foi dans l'interface (« Envoyée vers AC-KINETIK ») :
-- laisser cette marque ferait affirmer à l'app que des pesées jamais transmises l'ont été.
--
-- On rebascule donc ces lignes sur le NOUVEAU drapeau, qui dit la vérité : hors périmètre,
-- ni envoyées ni à envoyer. Signature reconnaissable : une transmission réelle intervient
-- toujours APRÈS l'enregistrement, jamais à l'horodatage exact de création.
UPDATE "measurements"
SET "fitness_sync_skipped" = true, "fitness_synced_at" = NULL
WHERE "fitness_synced_at" = "created_at";
