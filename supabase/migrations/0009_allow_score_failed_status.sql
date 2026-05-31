-- Scoring marks an artifact 'score_failed' when Claude's tool output cannot be
-- validated against the rubric schema (lib/scoring/score-artifacts.ts markFailed).
-- Migration 0001's artifacts_status_check never permitted that value, so the
-- UPDATE threw a constraint violation and crashed the scoring run mid-batch.
-- Add 'score_failed' to the allowed set so failed artifacts reach a terminal
-- state instead of looping as 'pending' (and re-billing) every run.
ALTER TABLE "artifacts" DROP CONSTRAINT IF EXISTS "artifacts_status_check";--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_status_check" CHECK ("status" IN ('pending', 'scored', 'score_failed', 'published', 'flagged', 'removed', 'taken_down'));
