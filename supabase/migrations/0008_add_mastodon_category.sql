-- Add the `mastodon` source category — Fediverse / ActivityPub grassroots social discourse,
-- the open and ungated stand-in for the credential-gated `reddit` category in the social
-- contrast class. A CHECK IN-list cannot be altered in place, so drop the old constraint and
-- re-add it with 'mastodon' included; every other allowed value is unchanged, and all existing
-- rows still satisfy the constraint (the change is purely additive).
ALTER TABLE "sources" DROP CONSTRAINT "sources_category_check";--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_category_check" CHECK ("category" IN ('youtube_api', 'bluesky', 'state_media_rss', 'genai_open_api', 'genai_curated_upload', 'reddit', 'mastodon', 'manual_upload', 'cultural_institution'));
