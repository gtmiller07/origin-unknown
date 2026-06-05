-- Precomputed per-artifact cosine-nearest-neighbor table (Wave 5 #9/#10). One row per
-- (artifact, rank) pair — top-6 nearest embedding neighbors by cosine distance. Computed
-- offline via scripts/compute-neighbors.ts; refreshed by npm run neighbors:compute.
-- Primary key on (artifact_id, rank) so re-computation is a simple upsert.
-- ON DELETE CASCADE: when an artifact is hard-deleted its neighbor rows go with it.
CREATE TABLE IF NOT EXISTS "artifact_neighbors" (
  "artifact_id" uuid NOT NULL REFERENCES "artifacts"("id") ON DELETE CASCADE,
  "neighbor_id" uuid NOT NULL REFERENCES "artifacts"("id") ON DELETE CASCADE,
  "similarity" numeric(5, 4) NOT NULL,
  "rank" smallint NOT NULL,
  PRIMARY KEY ("artifact_id", "rank")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artifact_neighbors_artifact_idx" ON "artifact_neighbors" ("artifact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artifact_neighbors_neighbor_idx" ON "artifact_neighbors" ("neighbor_id");
