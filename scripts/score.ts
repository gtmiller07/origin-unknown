/**
 * Manual scoring batch / backlog backfill: scores pending-with-embedding
 * artifacts through the production scoring engine, but with NO serverless 60s
 * ceiling (one Opus call measures ~42s, so only one artifact fits per Vercel
 * request — locally we can loop freely). Mirrors scripts/embed.ts.
 *
 * Bounded by an explicit count so a stray run can never drain the whole backlog:
 *   npm run score -- 25     scores at most 25, then stops
 *   npm run score           defaults to 25
 *
 * Honors the anthropic cost cap (stops early if capped) and prints running
 * spend so a long backfill stays observable. Re-running is safe and resumable:
 * scored artifacts leave the pending pool, so a second run continues the
 * backlog rather than re-charging work already done.
 */
import { useScriptDatabaseUrl } from './db-env';

const CHUNK = 5;

async function main() {
  useScriptDatabaseUrl();
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set in the environment (.env.local).');
  }

  const target = Number.parseInt(process.argv[2] ?? '25', 10);
  if (!Number.isFinite(target) || target < 1) {
    throw new Error(
      `Invalid count "${process.argv[2]}"; pass a positive integer, e.g. npm run score -- 25`
    );
  }

  const { scorePendingArtifacts } = await import('../lib/scoring/score-artifacts');

  console.log(`\nScoring up to ${target} pending artifact(s) with Opus (~42s each)...\n`);
  let scored = 0;
  let failed = 0;
  let inTok = 0;
  let outTok = 0;
  let costUsd = 0;
  const errors: string[] = [];

  while (scored + failed < target) {
    const limit = Math.min(CHUNK, target - (scored + failed));
    // No serverless ceiling here, so retry once to absorb the rare malformed
    // tool output that survives the flattened schema.
    const s = await scorePendingArtifacts({ limit, maxAttempts: 2 });
    scored += s.scored;
    failed += s.failed;
    inTok += s.totalInputTokens;
    outTok += s.totalOutputTokens;
    costUsd += s.costUsd;
    errors.push(...s.errors);
    console.log(
      `  +${s.scored} scored, +${s.failed} failed  |  total: ${scored} scored / ${failed} failed / ~$${costUsd.toFixed(4)}`
    );
    if (s.capped) {
      console.log('\n  Anthropic cost cap reached — stopping early.');
      break;
    }
    if (s.scanned === 0) {
      console.log('\n  No more pending artifacts.');
      break;
    }
  }

  console.log(
    `\nDone. ${scored} scored, ${failed} failed. Tokens: ${inTok} in / ${outTok} out (~$${costUsd.toFixed(4)}).`
  );
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors.slice(0, 20)) console.log(`  - ${e}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('\nScoring failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
