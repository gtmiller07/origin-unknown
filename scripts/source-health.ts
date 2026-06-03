/**
 * Read-only source-health / freshness report. The ingestion pipeline scores a fetch
 * as "success" on HTTP 200 + parseable, so an abandoned feed that still returns 200
 * (e.g. Xinhua, frozen at 2018) looks healthy by consecutive_failures alone. This
 * report instead keys off CONTENT freshness — the newest item date (published_at) per
 * source — so quietly-dead and undated feeds surface. Touches nothing; safe anytime.
 *
 *   npm run sources:health            # default: flag newest item > 30 days old
 *   npm run sources:health -- --days=14
 */
import { useScriptDatabaseUrl } from './db-env';

async function main() {
  useScriptDatabaseUrl();
  const daysFlag = process.argv.find((a) => a.startsWith('--days='));
  const staleDays = daysFlag ? Math.max(1, Number(daysFlag.split('=')[1]) || 30) : 30;

  const { db } = await import('../lib/db/client');
  const { sql } = await import('drizzle-orm');

  const rows = (await db.execute(sql`
    SELECT
      s.name, s.category, s.enabled,
      COALESCE(s.consecutive_failures, 0)::int AS fails,
      to_char(s.last_success_at, 'YYYY-MM-DD HH24:MI') AS last_success,
      count(a.id)::int AS total,
      count(a.id) FILTER (WHERE a.first_seen_at > now() - interval '7 days')::int AS ingest_7d,
      to_char(max(a.published_at), 'YYYY-MM-DD') AS newest_content,
      (current_date - max(a.published_at)::date) AS content_age_days,
      (current_date - max(a.first_seen_at)::date) AS ingest_age_days,
      count(a.id) FILTER (WHERE a.published_at IS NULL)::int AS undated
    FROM sources s
    LEFT JOIN artifacts a ON a.source_id = s.id
    GROUP BY s.id, s.name, s.category, s.enabled, s.consecutive_failures, s.last_success_at
    ORDER BY content_age_days DESC NULLS FIRST, total DESC
  `)) as unknown as Array<Record<string, unknown>>;

  console.log(`\nSource health — STALE = newest item > ${staleDays}d old, or no dated items\n`);
  let stale = 0;
  let off = 0;
  for (const r of rows) {
    const enabled = r.enabled !== false;
    // Museum/collection feeds legitimately carry no per-item publish dates; judge them
    // by ingestion recency (first_seen_at) so they aren't falsely flagged stale for
    // being "undated". Everything else is judged by newest content date.
    const isMuseum = r.category === 'cultural_institution';
    const contentAge = r.content_age_days === null ? null : Number(r.content_age_days);
    const ingestAge = r.ingest_age_days === null ? null : Number(r.ingest_age_days);
    const age = isMuseum ? ingestAge : contentAge;
    const isStale = enabled && (age === null || age > staleDays);
    if (!enabled) off += 1;
    else if (isStale) stale += 1;
    const flag = !enabled ? 'OFF  ' : isStale ? 'STALE' : ' ok  ';
    let newest: string;
    if (isMuseum) {
      newest = ingestAge === null ? 'no items' : `ingest ${ingestAge}d`;
    } else if (r.newest_content === null) {
      newest = `undated(${r.undated})`;
    } else {
      newest = `${r.newest_content} (${contentAge}d)`;
    }
    console.log(
      `${flag} ${String(r.name).slice(0, 40).padEnd(40)} ${String(r.category).padEnd(20)} ` +
        `newest=${String(newest).padEnd(20)} 7d=${String(r.ingest_7d).padStart(4)} ` +
        `total=${String(r.total).padStart(5)} fails=${r.fails}`
    );
  }
  console.log(
    `\n${rows.length} sources — ${stale} stale, ${off} disabled.  (threshold ${staleDays}d; override with --days=N)`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
