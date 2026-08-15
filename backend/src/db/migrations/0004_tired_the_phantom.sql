CREATE INDEX IF NOT EXISTS "error_logs_profile_id_created_at_idx" ON "error_logs" ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "measurements_profile_id_created_at_idx" ON "measurements" ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profiles_user_id_idx" ON "profiles" ("user_id");