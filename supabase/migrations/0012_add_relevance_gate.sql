-- Relevance gate (methodology redesign, step 2). The gate decides WHICH pending
-- artifacts are eligible for expensive Opus scoring, and is deliberately kept
-- ORTHOGONAL to artifacts.status: a sampling/triage decision is research data, not
-- a point in the scoring lifecycle, so it gets its own columns rather than a new
-- status value. NULL gate_decision = not yet gated.
--
-- Why this shape (see methodology redesign): cosine-similarity-to-the-question was
-- shown NOT to separate relevant from irrelevant (the known-relevant artifacts sit
-- at the corpus-mean similarity), so similarity is demoted to a STORED FEATURE
-- (question_similarity) and never a cutoff. The decision is driven by the
-- step-1 authorship taxonomy (taxonomy_prior / baseline_sample) and, for the
-- ambiguous 'unknown' bucket, a recall-biased Haiku classifier (haiku_triage).
--
-- gate_method records HOW the decision was reached, mirroring the *_provenance
-- ladder from migration 0010:
--   * taxonomy_prior  — decided from the step-1 fields (e.g. every challenger
--                       artifact is in-scope by definition).
--   * baseline_sample — incumbent baseline kept to a stratified RANDOM per-source
--                       sample; included rows are 'include', the rest 'exclude'.
--   * haiku_triage    — the Haiku relevance classifier set this (gate_reasoning /
--                       gate_confidence / gate_model record the judgment).

ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "gate_decision" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "gate_method" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "gate_reasoning" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "gate_confidence" numeric(3,2);--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "gate_model" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "gated_at" timestamptz;--> statement-breakpoint
-- Demoted similarity feature: cosine similarity to the dissertation-question
-- embedding (1 - pgvector cosine distance). Stored for analysis, never a gate cutoff.
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "question_similarity" real;--> statement-breakpoint

ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_gate_decision_check" CHECK ("gate_decision" IS NULL OR "gate_decision" IN ('include', 'exclude'));--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_gate_method_check" CHECK ("gate_method" IS NULL OR "gate_method" IN ('taxonomy_prior', 'baseline_sample', 'haiku_triage'));--> statement-breakpoint

-- Partial index for the step-4 scoring query (pending + embedded + gated-in).
CREATE INDEX IF NOT EXISTS "artifacts_gate_decision_idx" ON "artifacts" ("gate_decision", "status") WHERE "gate_decision" IS NOT NULL;--> statement-breakpoint

-- Hand-labeled calibration set: the human ground truth the Haiku threshold is tuned
-- against, persisted as research data (not a throwaway file). human_relevant is the
-- curator label; the haiku_* columns are filled when the classifier is run over the
-- same artifacts so a confusion matrix / recall figure is reproducible from the DB.
CREATE TABLE IF NOT EXISTS "relevance_calibration" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "artifact_id" uuid NOT NULL REFERENCES "artifacts"("id") ON DELETE CASCADE,
  "human_relevant" boolean NOT NULL,
  "human_notes" text,
  "haiku_relevant" boolean,
  "haiku_confidence" numeric(3,2),
  "haiku_reasoning" text,
  "haiku_model" text,
  "labeled_at" timestamptz DEFAULT now(),
  "classified_at" timestamptz,
  CONSTRAINT "relevance_calibration_artifact_unique" UNIQUE ("artifact_id")
);
