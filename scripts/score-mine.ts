/**
 * Scaled cross-cultural + ambiguous-mining scoring run (recommendations #2 + #3).
 *
 * Two video strata the first stratified run did not cover, both scored via the artifactIds
 * path (so a deliberate research sample is scored regardless of gate state):
 *   A — non-English challenger AI-video (the cross-cultural payoff: spa/hin/zho/por …)
 *   B — ambiguous-video (mines the ~1,884-video ambiguous pool, incl. Vimeo: the scorer
 *       assigns ai_mediation, surfacing which ambiguous videos are actually AI)
 *
 * Reports the six-axis means per stratum and, for the mined ambiguous set, the ai_mediation
 * the scorer assigned. Targets video specifically (not Mastodon text) per the corpus-balance
 * policy (rec #4).
 *
 *   export ANTHROPIC_API_KEY="$(grep '^ANTHROPIC_API_KEY=' .env.local | cut -d= -f2-)"
 *   node --env-file=.env.local --import tsx scripts/score-mine.ts 30
 */
import { inArray, sql } from 'drizzle-orm';
import { useScriptDatabaseUrl } from './db-env';

const CHUNK = 5;

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Shell-export it before running — node --env-file drops the last line of .env.local.'
    );
  }
  const perStratum = Math.max(1, Number.parseInt(process.argv[2] ?? '30', 10));
  useScriptDatabaseUrl();
  const { db } = await import('../lib/db/client');
  const { artifacts, scores } = await import('../lib/db/schema');
  const { scorePendingArtifacts } = await import('../lib/scoring/score-artifacts');

  const pick = async (predicate: ReturnType<typeof sql>) =>
    (
      (await db.execute(sql`
        SELECT a.id FROM artifacts a
        WHERE a.media_type='video' AND a.embedding IS NOT NULL AND a.status='pending' AND ${predicate}
        ORDER BY random() LIMIT ${perStratum}
      `)) as unknown as Array<{ id: string }>
    ).map((r) => r.id);

  const crossIds = await pick(
    sql`a.ai_mediation IN ('ai_generated','ai_assisted') AND a.language_codes IS NOT NULL AND NOT ('eng' = ANY(a.language_codes))`
  );
  const ambigIds = await pick(sql`a.ai_mediation IS NULL`);
  const allIds = [...crossIds, ...ambigIds];
  console.log(
    `Scaled sample: ${crossIds.length} non-English challenger-video + ${ambigIds.length} ambiguous-video = ${allIds.length}\n`
  );
  if (!allIds.length) {
    console.log('Nothing scorable.');
    process.exit(0);
  }

  let scored = 0;
  let failed = 0;
  let cost = 0;
  while (true) {
    const s = await scorePendingArtifacts({ artifactIds: allIds, limit: CHUNK, maxAttempts: 2 });
    scored += s.scored;
    failed += s.failed;
    cost += s.costUsd;
    console.log(`  +${s.scored}/${s.failed} | total ${scored}/${failed} ~$${cost.toFixed(4)}`);
    if (s.capped) {
      console.log('  anthropic cost cap reached — stopping early.');
      break;
    }
    if (s.scanned === 0) break;
  }
  console.log(`\nScored ${scored}, failed ${failed}, ~$${cost.toFixed(4)}.`);

  const meansFor = async (ids: string[]) =>
    ids.length
      ? await db
          .select({
            axis: scores.axis,
            mean: sql<string>`round(avg(${scores.aiProposedValue}), 3)`,
            n: sql<number>`count(*)::int`,
          })
          .from(scores)
          .where(inArray(scores.artifactId, ids))
          .groupBy(scores.axis)
      : [];
  const cross = new Map((await meansFor(crossIds)).map((r) => [r.axis, r]));
  const ambig = new Map((await meansFor(ambigIds)).map((r) => [r.axis, r]));
  const axes = [
    'origin',
    'reach',
    'aesthetic_signal',
    'diplomatic_cross_boundary',
    'diplomatic_authenticity',
    'diplomatic_reciprocity',
  ];
  console.log('\n=== six-axis means: non-English challenger-video vs ambiguous-video ===');
  for (const ax of axes) {
    const c = cross.get(ax);
    const a = ambig.get(ax);
    console.log(
      `  ${ax.padEnd(28)} cross-cultural=${c?.mean ?? '—'} (n=${c?.n ?? 0})   ambiguous=${a?.mean ?? '—'} (n=${a?.n ?? 0})`
    );
  }

  console.log('\n=== ambiguous-video mining: ai_mediation the scorer assigned ===');
  if (ambigIds.length) {
    for (const r of await db
      .select({ m: artifacts.aiMediation, n: sql<number>`count(*)::int` })
      .from(artifacts)
      .where(inArray(artifacts.id, ambigIds))
      .groupBy(artifacts.aiMediation)) {
      console.log(`  ${r.m ?? '(still null)'}: ${r.n}`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
