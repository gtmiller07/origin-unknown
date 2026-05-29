/**
 * Manual embeddings backfill: embeds every artifact missing an embedding, in
 * batches, against the real database. Mirrors scripts/ingest.ts and drains the
 * backlog by looping until no more rows can be embedded.
 *
 * Run with:  npm run embed
 */
import { useScriptDatabaseUrl } from './db-env';

async function main() {
  useScriptDatabaseUrl();
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set in the environment (.env.local).');
  }

  const { embedPendingArtifacts } = await import('../lib/ai/embed-artifacts');

  console.log('\nBackfilling artifact embeddings...\n');
  let pass = 0;
  let totalEmbedded = 0;
  let totalTokens = 0;
  for (;;) {
    const s = await embedPendingArtifacts({ limit: 500 });
    pass += 1;
    totalEmbedded += s.embedded;
    totalTokens += s.totalTokens;
    console.log(
      `  pass ${pass}: scanned=${s.scanned} embedded=${s.embedded} skipped=${s.skipped} tokens=${s.totalTokens}`
    );
    if (s.embedded === 0) break;
  }

  const costUsd = (totalTokens * (0.02 / 1_000_000)).toFixed(4);
  console.log(`\nDone. ${totalEmbedded} embeddings, ${totalTokens} tokens (~$${costUsd}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\nEmbedding failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
