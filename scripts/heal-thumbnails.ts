/**
 * Manual thumbnail healing — same logic as the cron but runs until the full backlog is processed.
 * Useful for initial seeding and after bulk ingestion runs.
 *   npm run heal:thumbnails
 */
import { sql } from 'drizzle-orm';
import { healThumbnailBatch } from '../lib/thumbnails/heal';
import { useScriptDatabaseUrl } from './db-env';

const BATCH_SIZE = 50;

async function main() {
  useScriptDatabaseUrl();
  const { db } = await import('../lib/db/client');

  let totalChecked = 0; let totalHealed = 0; let totalCleared = 0;
  let pass = 0;

  while (true) {
    pass++;
    const batch = (await db.execute(sql`
      SELECT id::text AS id, thumbnail_url, content_url
      FROM artifacts
      WHERE thumbnail_url IS NOT NULL AND status = 'scored' AND removed_at IS NULL
        AND (thumbnail_checked_at IS NULL OR thumbnail_checked_at < now() - interval '30 days')
      ORDER BY thumbnail_checked_at ASC NULLS FIRST
      LIMIT ${BATCH_SIZE}
    `)) as unknown as Array<{ id: string; thumbnail_url: string; content_url: string | null }>;

    if (!batch.length) break;

    const { results, ok, healed, cleared } = await healThumbnailBatch(
      batch.map((a) => ({ id: a.id, thumbnail_url: a.thumbnail_url, content_url: a.content_url }))
    );

    const now = new Date().toISOString();
    for (const r of results) {
      await db.execute(sql`
        UPDATE artifacts
        SET thumbnail_url = ${r.newUrl},
            thumbnail_checked_at = ${now},
            updated_at = CASE WHEN ${r.action !== 'ok'} THEN ${now} ELSE updated_at END
        WHERE id = ${r.id}
      `);
    }

    totalChecked += results.length;
    totalHealed += healed;
    totalCleared += cleared;
    process.stdout.write(
      `  Pass ${pass}: ${results.length} checked, ${healed} healed, ${cleared} cleared → total ${totalChecked}\r`
    );
  }

  console.log(`\nDone. Checked=${totalChecked} healed=${totalHealed} cleared=${totalCleared}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
