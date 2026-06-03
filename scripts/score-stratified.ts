/**
 * Stratified scoring run — a media-matched challenger-vs-incumbent comparison.
 *
 * The default scorer (scripts/score.ts) takes an arbitrary slice of the gate-included pool,
 * which under-samples the small challenger-video class. This selects a BALANCED sample — N
 * challenger VIDEO (AI films/clips: ai_generated/ai_assisted) and N incumbent VIDEO (human-made
 * broadcaster video) that are embedded + unscored — scores them through the production engine
 * (via the artifactIds path, which bypasses the gate for a deliberate research sample), then
 * prints the six-axis means side by side. The control is media-matched (video vs video) so the
 * contrast isolates AI mediation from medium rather than confounding the two.
 *
 *   export ANTHROPIC_API_KEY="$(grep '^ANTHROPIC_API_KEY=' .env.local | cut -d= -f2-)"
 *   node --env-file=.env.local --import tsx scripts/score-stratified.ts 30
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
  const { scores } = await import('../lib/db/schema');
  const { scorePendingArtifacts } = await import('../lib/scoring/score-artifacts');

  const pickVideo = async (predicate: ReturnType<typeof sql>) =>
    (
      (await db.execute(sql`
        SELECT a.id FROM artifacts a
        WHERE a.media_type='video' AND a.embedding IS NOT NULL AND a.status='pending' AND ${predicate}
        ORDER BY random() LIMIT ${perStratum}
      `)) as unknown as Array<{ id: string }>
    ).map((r) => r.id);

  const chalIds = await pickVideo(sql`a.ai_mediation IN ('ai_generated','ai_assisted')`);
  const incIds = await pickVideo(sql`a.ai_mediation = 'human_made'`);
  const allIds = [...chalIds, ...incIds];
  console.log(
    `Stratified video sample: ${chalIds.length} challenger + ${incIds.length} incumbent = ${allIds.length}\n`
  );
  if (!allIds.length) {
    console.log('Nothing scorable — embed/ingest the video pool first.');
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
    console.log(
      `  +${s.scored} scored / +${s.failed} failed | total ${scored}/${failed} ~$${cost.toFixed(4)}`
    );
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
  const chal = new Map((await meansFor(chalIds)).map((r) => [r.axis, r]));
  const inc = new Map((await meansFor(incIds)).map((r) => [r.axis, r]));
  const axes = [
    'origin',
    'reach',
    'aesthetic_signal',
    'diplomatic_cross_boundary',
    'diplomatic_authenticity',
    'diplomatic_reciprocity',
  ];
  console.log('\n=== six-axis means: challenger-video vs incumbent-video (this sample) ===');
  for (const ax of axes) {
    const c = chal.get(ax);
    const i = inc.get(ax);
    console.log(
      `  ${ax.padEnd(28)} challenger=${c?.mean ?? '—'} (n=${c?.n ?? 0})   incumbent=${i?.mean ?? '—'} (n=${i?.n ?? 0})`
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
