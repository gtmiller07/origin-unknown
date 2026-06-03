-- Add the `vimeo` source category — the curated/creator video platform (official REST API),
-- a counterpart to the broadcaster-heavy youtube_api set and a likely home for AI-generated
-- short films and festival entries. A CHECK IN-list cannot be altered in place, so drop the
-- old constraint and re-add it with 'vimeo' included; every other allowed value is unchanged,
-- and all existing rows still satisfy the constraint (the change is purely additive). Mirrors
-- migration 0008, which added 'mastodon' the same way.
ALTER TABLE "sources" DROP CONSTRAINT "sources_category_check";--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_category_check" CHECK ("category" IN ('youtube_api', 'bluesky', 'state_media_rss', 'genai_open_api', 'genai_curated_upload', 'reddit', 'mastodon', 'manual_upload', 'cultural_institution', 'vimeo'));
