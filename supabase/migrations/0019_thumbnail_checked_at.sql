-- Track when a thumbnail URL was last verified reachable. NULL = never checked.
-- The heal-thumbnails cron uses this to prioritise never-checked URLs and re-check
-- monthly so stale CDN links get caught before they accumulate.
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "thumbnail_checked_at" timestamptz;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artifacts_thumbnail_heal_idx"
  ON "artifacts" ("thumbnail_checked_at")
  WHERE "thumbnail_url" IS NOT NULL AND "status" = 'scored' AND "removed_at" IS NULL;
