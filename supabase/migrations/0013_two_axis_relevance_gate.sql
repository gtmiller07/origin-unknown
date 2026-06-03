-- Two-axis relevance gate (methodology redesign, step 2 — design revision). The
-- gate now makes TWO independent recall-biased judgments and keeps an artifact on
-- EITHER one:
--   * Judgment A — cultural storytelling: subject or FORM is cultural/creative
--     production (or reporting specifically ABOUT it). Straight news, commerce, and
--     spam are out.
--   * Judgment B — AI mediation / origin ambiguity: AI-generated or AI-assisted
--     creative work, OR genuinely ambiguous authorship/origin. Stands on its own —
--     the bullseye of this corpus is kept even when it does not look "cultural", and
--     dropping a genuine AI/ambiguous artifact is the most damaging error the gate
--     can make.
--
-- Storing both per-axis verdicts (not just the collapsed keep/drop) is deliberate:
-- the calibration threshold sweep recomputes keep from BOTH confidences, and "which
-- judgment kept this artifact" is itself research data (ambiguity as data). All
-- additive, nullable, idempotent — no backfill; rows gated under the prior
-- single-axis verdict keep their existing gate_decision and read NULL on the new
-- per-axis columns.

-- Production artifacts: per-axis verdict alongside the existing gate_decision /
-- gate_confidence (governing confidence) / gate_reasoning (the one-sentence signal).
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "gate_cultural_relevant" boolean;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "gate_cultural_confidence" numeric(3,2);--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "gate_ai_or_ambiguous" boolean;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "gate_ai_confidence" numeric(3,2);--> statement-breakpoint

-- Calibration set: the classifier's per-axis verdict on each hand-labeled artifact,
-- so the threshold sweep can recompute keep = (A || conf<T) || (B || conf<T) from
-- the stored confidences. haiku_keep is the model's OWN keep call, kept as a fixed
-- baseline to compare against the tuned-threshold gate. The one-sentence signal
-- reuses the existing haiku_reasoning column; the legacy haiku_relevant /
-- haiku_confidence columns are left in place but no longer written.
ALTER TABLE "relevance_calibration" ADD COLUMN IF NOT EXISTS "haiku_cultural_relevant" boolean;--> statement-breakpoint
ALTER TABLE "relevance_calibration" ADD COLUMN IF NOT EXISTS "haiku_cultural_confidence" numeric(3,2);--> statement-breakpoint
ALTER TABLE "relevance_calibration" ADD COLUMN IF NOT EXISTS "haiku_ai_or_ambiguous" boolean;--> statement-breakpoint
ALTER TABLE "relevance_calibration" ADD COLUMN IF NOT EXISTS "haiku_ai_confidence" numeric(3,2);--> statement-breakpoint
ALTER TABLE "relevance_calibration" ADD COLUMN IF NOT EXISTS "haiku_keep" boolean;
