-- Soft-delete + human-vetting markers for artifacts (admin backend). Additive and nullable: no data
-- change, nothing breaks. A hard DELETE is blocked by the scoring_events and takedown_requests
-- RESTRICT foreign keys and would destroy the scoring audit trail, so removal is a soft delete
-- (removed_at) that every public read filters out — reversible and auditable. vetted_at records that
-- a curator reviewed the asset and drives the vetting queue.
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "removed_at" timestamptz;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "removed_reason" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "removed_by" uuid REFERENCES "curators"("id");--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "vetted_at" timestamptz;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "vetted_by" uuid REFERENCES "curators"("id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artifacts_removed_at_idx" ON "artifacts" ("removed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artifacts_vetting_queue_idx" ON "artifacts" ("status", "vetted_at") WHERE "removed_at" IS NULL;
