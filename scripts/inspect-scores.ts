/**
 * Read-only scoring inspector for validation. Dumps (1) artifact status counts,
 * (2) the artifacts currently in score_failed with their last scoring-call token
 * counts and error (to tell a serialization quirk from a max_tokens truncation),
 * and (3) a six-axis value matrix for everything scored in the recent window, so
 * cross-artifact axis discrimination and type variety can be eyeballed at a glance.
 * Purely diagnostic — writes nothing.
 */
import { useScriptDatabaseUrl } from './db-env';

async function main() {
  useScriptDatabaseUrl();
  const { db } = await import('../lib/db/client');
  const { sql } = await import('drizzle-orm');

  const counts = await db.execute(sql`
    SELECT status, count(*)::int AS n FROM artifacts GROUP BY status ORDER BY n DESC
  `);
  console.log('\n=== STATUS COUNTS ===');
  for (const r of counts as unknown as Array<Record<string, unknown>>) {
    console.log(`  ${String(r.status).padEnd(14)} ${r.n}`);
  }

  const failed = await db.execute(sql`
    SELECT a.id, left(a.title, 70) AS title, a.media_type AS media, a.is_ai_generated AS ai,
           l.input_tokens AS in_tok, l.output_tokens AS out_tok, left(coalesce(l.error_message, ''), 90) AS err
    FROM artifacts a
    LEFT JOIN LATERAL (
      SELECT input_tokens, output_tokens, error_message
      FROM api_call_log
      WHERE artifact_id = a.id AND operation = 'scoring'
      ORDER BY occurred_at DESC LIMIT 1
    ) l ON true
    WHERE a.status = 'score_failed'
    ORDER BY l.output_tokens DESC NULLS LAST
  `);
  console.log('\n=== SCORE_FAILED (terminal this run) ===');
  for (const r of failed as unknown as Array<Record<string, unknown>>) {
    console.log(
      `  ${String(r.id).slice(0, 8)} ${String(r.media).padEnd(6)} ai=${String(r.ai ?? '?').padEnd(5)} in=${r.in_tok} out=${r.out_tok}  ${r.title}`
    );
    console.log(`           err: ${r.err}`);
  }

  // 6fea9ca8 — did the prior parse failure recover via coercion this run?
  const target = await db.execute(sql`
    SELECT left(id::text, 8) AS id, status FROM artifacts WHERE id = '6fea9ca8-9805-4e1e-9bf5-466ed6aaf0de'
  `);
  console.log('\n=== 6fea9ca8 (prior parse failure) ===');
  for (const r of target as unknown as Array<Record<string, unknown>>) {
    console.log(`  ${r.id} -> ${r.status}`);
  }

  const rows = await db.execute(sql`
    SELECT a.id, a.title, a.media_type AS media, a.is_ai_generated AS ai,
           a.bears_on_dissertation_question AS bears, a.updated_at AS uat,
           s.axis, s.ai_proposed_value AS val
    FROM artifacts a
    JOIN scores s ON s.artifact_id = a.id
    WHERE a.status = 'scored' AND a.updated_at >= now() - interval '6 hours'
    ORDER BY a.updated_at DESC, s.axis
  `);

  const AXES = [
    'origin',
    'reach',
    'aesthetic_signal',
    'diplomatic_cross_boundary',
    'diplomatic_authenticity',
    'diplomatic_reciprocity',
  ];
  const byId = new Map<
    string,
    {
      title: string;
      media: string;
      ai: unknown;
      bears: unknown;
      uat: string;
      vals: Record<string, string>;
    }
  >();
  for (const r of rows as unknown as Array<Record<string, unknown>>) {
    const id = String(r.id);
    let entry = byId.get(id);
    if (!entry) {
      entry = {
        title: String(r.title ?? '').slice(0, 46),
        media: String(r.media ?? ''),
        ai: r.ai,
        bears: r.bears,
        uat: String(r.uat ?? ''),
        vals: {},
      };
      byId.set(id, entry);
    }
    entry.vals[String(r.axis)] = r.val === null ? 'null' : String(r.val);
  }

  console.log(`\n=== SCORED MATRIX (recent window, ${byId.size} artifacts) ===`);
  console.log(
    `  ${'media'.padEnd(6)} ${'ai'.padEnd(5)} ${'org'.padEnd(5)} ${'rch'.padEnd(5)} ${'aes'.padEnd(5)} ${'xbd'.padEnd(5)} ${'aut'.padEnd(5)} ${'rcp'.padEnd(5)} b  title`
  );
  for (const [, v] of byId) {
    const cell = (a: string) => (v.vals[a] ?? '-').padEnd(5);
    console.log(
      `  ${v.media.padEnd(6)} ${String(v.ai ?? '?').padEnd(5)} ${AXES.map(cell).join(' ')} ${v.bears ? 'Y' : 'n'}  ${v.title}`
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
