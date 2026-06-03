/**
 * Read-only corpus composition report (methodology step 4 / #27). Touches nothing; safe anytime.
 *
 * Summarizes the incumbent-vs-challenger instrument: authorship-class mix, relevance-gate
 * status + method, media-type and category spread, embedding + scoring coverage, and — once
 * scores exist — six-axis score means split by challenger vs incumbent (the core comparison
 * the instrument is built to make). ai_mediation set but gate ungated = backfilled-not-yet-gated.
 *
 *   node --env-file=.env.local --import tsx scripts/composition-report.ts
 */
import { useScriptDatabaseUrl } from './db-env';

type Row = Record<string, unknown>;

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}
function line(label: string, n: unknown, extra = '') {
  console.log(`  ${String(label).padEnd(40)} ${String(n).padStart(7)}${extra}`);
}

async function main() {
  useScriptDatabaseUrl();
  const { db } = await import('../lib/db/client');
  const { sql } = await import('drizzle-orm');
  const q = async (query: ReturnType<typeof sql>) => (await db.execute(query)) as unknown as Row[];

  const [corpus] = await q(sql`
    SELECT count(*)::int AS total, count(embedding)::int AS embedded FROM artifacts`);
  const total = Number(corpus.total);
  section('Corpus');
  line('artifacts (total)', total);
  line(
    'embedded',
    corpus.embedded,
    `  (${total ? Math.round((Number(corpus.embedded) / total) * 100) : 0}%)`
  );

  section('Authorship class (the instrument axis)');
  for (const r of await q(sql`
    SELECT CASE
        WHEN ai_mediation IN ('ai_generated','ai_assisted') THEN '1 challenger (AI-mediated)'
        WHEN ai_mediation = 'human_made' THEN '2 incumbent (human-made)'
        ELSE '3 ambiguous (ungraded)' END AS class,
      count(*)::int AS n
    FROM artifacts GROUP BY 1 ORDER BY 1`)) {
    line(String(r.class).slice(2), r.n);
  }

  section('ai_mediation detail');
  for (const r of await q(sql`
    SELECT coalesce(ai_mediation,'(null)') AS v, count(*)::int AS n
    FROM artifacts GROUP BY 1 ORDER BY n DESC`)) {
    line(String(r.v), r.n);
  }

  section('Relevance gate (decision / method)');
  for (const r of await q(sql`
    SELECT coalesce(gate_decision,'(ungated)') AS decision, coalesce(gate_method,'-') AS method,
           count(*)::int AS n
    FROM artifacts GROUP BY 1,2 ORDER BY 1, n DESC`)) {
    line(`${r.decision} / ${r.method}`, r.n);
  }

  section('Media type — challenger class only (AI video focus)');
  for (const r of await q(sql`
    SELECT coalesce(media_type,'(null)') AS v, count(*)::int AS n
    FROM artifacts WHERE ai_mediation IN ('ai_generated','ai_assisted')
    GROUP BY 1 ORDER BY n DESC`)) {
    line(String(r.v), r.n);
  }

  section('By source category');
  for (const r of await q(sql`
    SELECT s.category AS v, count(*)::int AS n
    FROM artifacts a JOIN sources s ON s.id=a.source_id GROUP BY 1 ORDER BY n DESC`)) {
    line(String(r.v), r.n);
  }

  section('Scoring coverage');
  const [sc] = await q(sql`
    SELECT count(DISTINCT artifact_id)::int AS scored, count(*)::int AS rows, count(DISTINCT axis)::int AS axes
    FROM scores`);
  line('scored artifacts (distinct)', sc.scored);
  line('score rows', sc.rows, `  across ${sc.axes} axes`);

  if (Number(sc.rows) > 0) {
    section('Six-axis mean — challenger vs incumbent');
    for (const r of await q(sql`
      SELECT sc.axis,
             CASE WHEN a.ai_mediation IN ('ai_generated','ai_assisted') THEN 'challenger'
                  WHEN a.ai_mediation='human_made' THEN 'incumbent' ELSE 'ambiguous' END AS class,
             count(*)::int AS n,
             round(avg(coalesce(sc.value, sc.ai_proposed_value)),3) AS mean
      FROM scores sc JOIN artifacts a ON a.id=sc.artifact_id
      GROUP BY 1,2 ORDER BY 1,2`)) {
      line(`${r.axis} [${r.class}]`, `n=${r.n}`, `  mean=${r.mean}`);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
