/**
 * Parallel scoring batch — the "$100 corpus power-up".
 *
 * Scores a large RANDOM sample of gate-included, embedded, still-pending artifacts through the
 * production scoring engine, run as K concurrent workers so a ~1,000-artifact batch finishes in
 * ~3h instead of the ~12h a single sequential pass would take. Each worker owns a disjoint slice
 * of pre-selected artifact IDs (round-robin split), so workers never race on row selection; each
 * scores its slice via the production scorePendingArtifacts(artifactIds) path — identical prompt,
 * persistence, taxonomy locks and cost logging as the cron/score paths, only the selection is
 * pre-sliced. Because each worker scores its chunk sequentially, at most K Opus calls are ever in
 * flight (the DB pool is max:1, so the brief per-row persist transactions just queue — negligible
 * next to the ~42s Opus call they bracket).
 *
 * Budget-bounded by an explicit count (default + hard ceiling MAX_TOTAL ≈ $98 at ~$0.098/artifact)
 * because the rolling anthropic cost cap currently reads ~$0 from a test-clock artifact and so will
 * NOT auto-stop the run — the count is the spend control. Safe + resumable: scored rows leave the
 * pending pool, so a re-run tops up rather than re-charging work already done.
 *
 *   export ANTHROPIC_API_KEY="$(grep '^ANTHROPIC_API_KEY=' .env.local | cut -d= -f2-)"
 *   npm run score:batch -- 1000 4        # total=1000, concurrency=4
 */
import { eq, inArray, sql } from 'drizzle-orm';
import { useScriptDatabaseUrl } from './db-env';

const CHUNK = 5; // ids scored per scorePendingArtifacts call → progress granularity
const MAX_TOTAL = 1000; // hard budget ceiling (~$98); the count is the only real spend brake
const DEFAULT_TOTAL = 1000;
const DEFAULT_CONCURRENCY = 4;
const COST_PER_ARTIFACT = 0.098; // observed: v1.2 run billed $7.8325 / 80 = $0.0979

const AXES = [
  'origin',
  'reach',
  'aesthetic_signal',
  'diplomatic_cross_boundary',
  'diplomatic_authenticity',
  'diplomatic_reciprocity',
] as const;

/** Round-robin split → K near-equal disjoint slices (so each worker gets a representative mix). */
function sliceInto<T>(arr: T[], k: number): T[][] {
  const out: T[][] = Array.from({ length: k }, () => []);
  arr.forEach((x, i) => out[i % k].push(x));
  return out;
}
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Shell-export it before running — node --env-file drops the last line of .env.local.'
    );
  }
  console.log(`anthropic key: present (len ${process.env.ANTHROPIC_API_KEY.length})`);

  let total = Number.parseInt(process.argv[2] ?? String(DEFAULT_TOTAL), 10);
  if (!Number.isFinite(total) || total < 1) total = DEFAULT_TOTAL;
  if (total > MAX_TOTAL) {
    console.log(`Requested ${total} > budget ceiling ${MAX_TOTAL}; clamping to ${MAX_TOTAL} (~$98).`);
    total = MAX_TOTAL;
  }
  let concurrency = Number.parseInt(process.argv[3] ?? String(DEFAULT_CONCURRENCY), 10);
  if (!Number.isFinite(concurrency) || concurrency < 1) concurrency = DEFAULT_CONCURRENCY;
  concurrency = Math.min(concurrency, 8); // sane upper bound for API rate limits + the max:1 pool

  useScriptDatabaseUrl();
  const { db } = await import('../lib/db/client');
  const { artifacts, scores } = await import('../lib/db/schema');
  const { scorePendingArtifacts } = await import('../lib/scoring/score-artifacts');

  // Representative random sample of the gate-included, embedded, still-pending pool. random() over
  // the ~few-thousand-row included-pending set is cheap and avoids the source/recency skew an
  // ORDER BY created_at would introduce.
  const picked = (await db.execute(sql`
    SELECT id FROM artifacts
    WHERE embedding IS NOT NULL AND status = 'pending' AND gate_decision = 'include'
    ORDER BY random()
    LIMIT ${total}
  `)) as unknown as Array<{ id: string }>;
  const ids = picked.map((r) => r.id);

  console.log(`\n=== parallel scoring batch: ${ids.length} artifacts, concurrency ${concurrency} ===`);
  console.log(
    `Estimated: ~$${(ids.length * COST_PER_ARTIFACT).toFixed(0)}, ~${(
      ((ids.length / concurrency) * 42) /
      3600
    ).toFixed(1)}h wall-clock\n`
  );
  if (!ids.length) {
    console.log('Nothing scorable — the included-pending pool is empty.');
    process.exit(0);
  }

  const slices = sliceInto(ids, concurrency);
  const t0 = Date.now();
  let scored = 0;
  let failed = 0;
  let cost = 0;
  let stop = false;
  const errors: string[] = [];

  const worker = async (slice: string[], label: number) => {
    for (const ch of chunk(slice, CHUNK)) {
      if (stop) return;
      // One call per chunk (limit = chunk size). Leftover transport-failures stay 'pending' and
      // are picked up by a later run/cron rather than retried in a loop here — no infinite loop.
      const s = await scorePendingArtifacts({ artifactIds: ch, limit: CHUNK, maxAttempts: 2 });
      scored += s.scored;
      failed += s.failed;
      cost += s.costUsd;
      errors.push(...s.errors);
      const mins = ((Date.now() - t0) / 60000).toFixed(0);
      console.log(
        `  [w${label}] +${s.scored}/${s.failed} | run ${scored} scored / ${failed} failed ~$${cost.toFixed(2)} | ${mins}m`
      );
      if (s.capped) {
        console.log('  anthropic cost cap reached — stopping all workers.');
        stop = true;
        return;
      }
    }
  };

  await Promise.all(slices.map((s, i) => worker(s, i + 1)));

  const mins = ((Date.now() - t0) / 60000).toFixed(0);
  console.log(`\nDone. ${scored} scored, ${failed} failed, ~$${cost.toFixed(2)} in ${mins}m.`);
  if (errors.length) {
    console.log(`\nErrors (${errors.length}, first 15):`);
    for (const e of errors.slice(0, 15)) console.log(`  - ${e}`);
  }

  // Corpus-wide readout: six-axis means by ai_mediation class over THIS batch (one score row per
  // artifact×axis, so per-axis n == artifact count in that class). Gives an immediate analytic
  // signal without waiting on a separate report.
  const m = await db
    .select({
      cls: artifacts.aiMediation,
      axis: scores.axis,
      mean: sql<string>`round(avg(${scores.aiProposedValue}), 3)`,
      n: sql<number>`count(*)::int`,
    })
    .from(scores)
    .innerJoin(artifacts, eq(artifacts.id, scores.artifactId))
    .where(inArray(scores.artifactId, ids))
    .groupBy(artifacts.aiMediation, scores.axis);

  const cell = new Map<string, { mean: string; n: number }>();
  const present = new Set<string>();
  for (const r of m) {
    const c = r.cls ?? 'null';
    present.add(c);
    cell.set(`${c}|${r.axis}`, { mean: r.mean, n: r.n });
  }
  const order = ['ai_generated', 'ai_assisted', 'human_made', 'unknown', 'null'];
  const cols = order.filter((c) => present.has(c));
  for (const c of present) if (!cols.includes(c)) cols.push(c);

  if (cols.length) {
    console.log('\n=== six-axis means by ai_mediation (this batch) ===');
    console.log('axis'.padEnd(28) + cols.map((c) => c.padEnd(18)).join(''));
    for (const ax of AXES) {
      let line = ax.padEnd(28);
      for (const c of cols) {
        const v = cell.get(`${c}|${ax}`);
        line += (v ? `${v.mean} (n=${v.n})` : '—').padEnd(18);
      }
      console.log(line);
    }
  }
  console.log('\nBATCH_DONE');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nscore-batch failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
