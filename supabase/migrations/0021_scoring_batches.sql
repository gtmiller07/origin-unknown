-- Message Batches API support (hybrid scoring). Bulk scoring is submitted to Anthropic's
-- async Message Batches API at ~50% cost; the synchronous looped cron stays for freshness.
--
-- scoring_batches: one row per submitted batch, the ledger the poll/ingest step reads.
-- artifacts.scoring_batch_id: marks an artifact as in-flight in a batch so neither the
--   batch submitter nor the synchronous scorer re-selects it. Cleared (NULL) on a failed/
--   expired request so it re-enters the queue; left set once scored (audit trail).
-- We intentionally do NOT add a new artifacts.status value — status has a CHECK constraint
-- (pending/scored/published/flagged/removed/taken_down); the nullable column is cleaner.

CREATE TABLE IF NOT EXISTS "scoring_batches" (
  "id" text PRIMARY KEY,                       -- Anthropic batch id (msgbatch_...)
  "status" text NOT NULL DEFAULT 'submitted',  -- submitted | in_progress | ended | ingested | failed
  "request_count" integer NOT NULL,
  "ingested_count" integer NOT NULL DEFAULT 0,
  "failed_count" integer NOT NULL DEFAULT 0,
  "est_cost_usd" numeric(10,4),
  "actual_cost_usd" numeric(10,4),
  "scoring_prompt_version" text,
  "submitted_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

ALTER TABLE "scoring_batches" ADD CONSTRAINT "scoring_batches_status_check"
  CHECK ("status" IN ('submitted','in_progress','ended','ingested','failed'));--> statement-breakpoint

ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "scoring_batch_id" text;--> statement-breakpoint

-- Partial index: the submitter/scorer "in-flight?" check (scoring_batch_id IS NOT NULL).
CREATE INDEX IF NOT EXISTS "artifacts_scoring_batch_id_idx"
  ON "artifacts" ("scoring_batch_id") WHERE "scoring_batch_id" IS NOT NULL;
