/**
 * Compute and persist top-6 cosine-nearest embedding neighbors for every scored+dated tunnel
 * artifact (728 rows, all have embeddings). Scoped to tunnel-visible artifacts to keep it fast —
 * the neighbors are used only for wall placement and lineage threads in the 3D corridor.
 *
 * Uses a single correlated LATERAL query per artifact (one round-trip per artifact, not per
 * neighbor pair), leveraging the existing HNSW index. 728 artifacts × ~0.8ms each ≈ 1 min.
 * Idempotent: DELETE + INSERT per artifact. Run with:
 *   npm run neighbors:compute
 */
import { sql } from 'drizzle-orm';
import { useScriptDatabaseUrl } from './db-env';

const TOP_N = 6;

async function main() {
  useScriptDatabaseUrl();
  const { db } = await import('../lib/db/client');

  // Fetch only tunnel-visible artifacts (scored + dated + not removed).
  const ids = (await db.execute(sql`
    SELECT id::text AS id FROM artifacts
    WHERE status = 'scored' AND published_at IS NOT NULL AND removed_at IS NULL AND embedding IS NOT NULL
    ORDER BY published_at
  `)) as unknown as Array<{ id: string }>;

  console.log(`Computing neighbors for ${ids.length} tunnel artifacts (top ${TOP_N} each)…`);

  let done = 0;
  let neighborRows = 0;

  for (const { id } of ids) {
    // One LATERAL query returns top-N neighbors ranked by cosine distance via HNSW.
    const neighbors = (await db.execute(sql`
      SELECT n.id::text AS "neighborId",
             (1 - (n.embedding <=> target.embedding))::numeric(5,4) AS similarity
      FROM artifacts target
      CROSS JOIN LATERAL (
        SELECT id, embedding
        FROM artifacts
        WHERE id <> ${id}
          AND embedding IS NOT NULL
          AND status = 'scored'
          AND published_at IS NOT NULL
          AND removed_at IS NULL
        ORDER BY embedding <=> target.embedding
        LIMIT ${TOP_N}
      ) n
      WHERE target.id = ${id}
    `)) as unknown as Array<{ neighborId: string; similarity: string }>;

    if (!neighbors.length) { done++; continue; }

    await db.execute(sql`DELETE FROM artifact_neighbors WHERE artifact_id = ${id}`);
    for (let rank = 0; rank < neighbors.length; rank++) {
      const n = neighbors[rank];
      if (!n) continue;
      await db.execute(sql`
        INSERT INTO artifact_neighbors (artifact_id, neighbor_id, similarity, rank)
        VALUES (${id}, ${n.neighborId}, ${n.similarity}, ${rank})
      `);
      neighborRows++;
    }

    done++;
    if (done % 50 === 0) process.stdout.write(`  ${done}/${ids.length}\r`);
  }

  const [count] = (await db.execute(
    sql`SELECT count(*)::int AS n FROM artifact_neighbors`
  )) as unknown as Array<{ n: number }>;
  console.log(`\nDone. ${count?.n ?? neighborRows} neighbor rows inserted.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
