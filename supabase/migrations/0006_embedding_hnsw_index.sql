-- HNSW index for approximate nearest-neighbour search over artifact embeddings.
-- text-embedding-3-small vectors are L2-normalised, so cosine distance and inner
-- product rank identically; cosine (vector_cosine_ops) is the conventional choice.
-- Plain CREATE INDEX (not CONCURRENTLY) because the migration runner wraps each
-- file in a transaction; at this corpus size the brief lock is immaterial.
CREATE INDEX IF NOT EXISTS "artifacts_embedding_hnsw_idx"
  ON "artifacts" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
