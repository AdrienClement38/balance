ALTER TABLE "measurements" ADD COLUMN "fitness_synced_at" timestamp with time zone;--> statement-breakpoint
-- `fitness_synced_at IS NULL` signifie « reste à envoyer à l'app fitness », et le rattrapage
-- rejoue tout ce qui traîne. Sans cette ligne, l'ajout de la colonne rendrait d'un coup TOUT
-- l'historique éligible : la première pesée après déploiement déclencherait un envoi massif,
-- non voulu et invisible dans le code.
-- On considère donc l'existant comme déjà traité. Renvoyer volontairement l'historique reste
-- possible plus tard, en repassant les lignes voulues à NULL.
UPDATE "measurements" SET "fitness_synced_at" = "created_at" WHERE "fitness_synced_at" IS NULL;
