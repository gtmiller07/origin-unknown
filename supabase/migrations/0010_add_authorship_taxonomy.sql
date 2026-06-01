-- Authorship taxonomy for the incumbent-vs-challenger comparative design
-- (methodology redesign, step 1). Adds three artifact-level classification fields,
-- each PAIRED with a *_provenance marker that records HOW the value was set, so a
-- source-derived prior is never silently confused with a model or human judgment:
--   * source_prior    — stamped deterministically below from the source category
--   * ai_proposed      — set or revised later by the Opus scorer / Haiku classifier
--   * human_confirmed  — set or confirmed later by a curator
-- (The provenance vocabulary deliberately reuses scoring_events' 'ai_proposed' /
-- 'human_confirmed' ladder so the whole codebase speaks one dialect.)
--
-- A NULL value = not yet determined. Ambiguity is recorded as DATA
-- ('ambiguous_unattributable', 'unknown', 'high'), never as a missing value.
--
-- The backfill stamps ONLY what each source category establishes. Hard ground
-- truth (generative-AI platform => ai_generated; state newsroom => state_affiliated
-- + human_made; museum => commercial_institutional + human_made) and defensible
-- category priors are stamped 'source_prior'; genuinely per-artifact judgments
-- (e.g. origin_ambiguity for AI-generated work, whose ambiguity is the whole point)
-- are deliberately left NULL for the scorer to fill. manual_upload is NOT stamped:
-- its taxonomy comes from per-upload curator metadata, not a category prior.

ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "authorship_class" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "authorship_class_provenance" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "ai_mediation" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "ai_mediation_provenance" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "origin_ambiguity" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "origin_ambiguity_provenance" text;--> statement-breakpoint

-- CHECK constraints (mirrors the closed-set style of migration 0001). Each allows
-- NULL (= not yet determined) plus its closed value set.
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_authorship_class_check" CHECK ("authorship_class" IS NULL OR "authorship_class" IN ('individual_creator', 'community_collective', 'commercial_institutional', 'state_affiliated', 'ambiguous_unattributable'));--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_ai_mediation_check" CHECK ("ai_mediation" IS NULL OR "ai_mediation" IN ('human_made', 'ai_assisted', 'ai_generated', 'unknown'));--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_origin_ambiguity_check" CHECK ("origin_ambiguity" IS NULL OR "origin_ambiguity" IN ('none', 'low', 'high'));--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_authorship_class_provenance_check" CHECK ("authorship_class_provenance" IS NULL OR "authorship_class_provenance" IN ('source_prior', 'ai_proposed', 'human_confirmed'));--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_ai_mediation_provenance_check" CHECK ("ai_mediation_provenance" IS NULL OR "ai_mediation_provenance" IN ('source_prior', 'ai_proposed', 'human_confirmed'));--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_origin_ambiguity_provenance_check" CHECK ("origin_ambiguity_provenance" IS NULL OR "origin_ambiguity_provenance" IN ('source_prior', 'ai_proposed', 'human_confirmed'));--> statement-breakpoint

-- Backfill source-derived priors ------------------------------------------------
-- CHALLENGER — generative-AI platforms. ai_mediation = ai_generated is GROUND
-- TRUTH (the platform is definitionally generative). authorship_class is a softer
-- prior: open generative communities (e.g. Civitai) are individual-creator
-- dominated, so 'individual_creator' is stamped as a prior the scorer MAY revise
-- (its provenance would then flip to 'ai_proposed'). origin_ambiguity is
-- per-artifact for AI work and is left NULL for the scorer.
UPDATE "artifacts" a
SET "ai_mediation" = 'ai_generated',
    "ai_mediation_provenance" = 'source_prior',
    "authorship_class" = 'individual_creator',
    "authorship_class_provenance" = 'source_prior'
FROM "sources" s
WHERE a."source_id" = s."id"
  AND s."category" IN ('genai_open_api', 'genai_curated_upload');--> statement-breakpoint

-- INCUMBENT BASELINE — state media. state_affiliated + human_made are ground truth;
-- institutional publishing carries clear attribution, so origin_ambiguity = none.
UPDATE "artifacts" a
SET "authorship_class" = 'state_affiliated',
    "authorship_class_provenance" = 'source_prior',
    "ai_mediation" = 'human_made',
    "ai_mediation_provenance" = 'source_prior',
    "origin_ambiguity" = 'none',
    "origin_ambiguity_provenance" = 'source_prior'
FROM "sources" s
WHERE a."source_id" = s."id"
  AND s."category" = 'state_media_rss';--> statement-breakpoint

-- INCUMBENT BASELINE — cultural institutions (museums, archives). Same shape as
-- state media: clear institutional attribution, human-made, unambiguous origin.
UPDATE "artifacts" a
SET "authorship_class" = 'commercial_institutional',
    "authorship_class_provenance" = 'source_prior',
    "ai_mediation" = 'human_made',
    "ai_mediation_provenance" = 'source_prior',
    "origin_ambiguity" = 'none',
    "origin_ambiguity_provenance" = 'source_prior'
FROM "sources" s
WHERE a."source_id" = s."id"
  AND s."category" = 'cultural_institution';--> statement-breakpoint

-- AMBIGUOUS — open social / UGC platforms. The source establishes only that
-- authorship is unattributable and mediation is unknown; BOTH are real priors
-- (recorded as data, not as nulls), to be resolved per-artifact downstream by the
-- Haiku classifier / scorer. origin_ambiguity is left NULL for the scorer.
UPDATE "artifacts" a
SET "authorship_class" = 'ambiguous_unattributable',
    "authorship_class_provenance" = 'source_prior',
    "ai_mediation" = 'unknown',
    "ai_mediation_provenance" = 'source_prior'
FROM "sources" s
WHERE a."source_id" = s."id"
  AND s."category" IN ('youtube_api', 'mastodon', 'bluesky', 'reddit');
