/**
 * Operational readout of the anthropic/openai cost caps and recent actual spend. Read-only.
 *   node --env-file=.env.local --import tsx scripts/check-caps.ts
 */
import { sql } from 'drizzle-orm';
import { useScriptDatabaseUrl } from './db-env';

async function main() {
  useScriptDatabaseUrl();
  const { db } = await import('../lib/db/client');

  const caps = (await db.execute(sql`
    SELECT service, daily_cap_usd, monthly_cap_usd, current_daily_spend_usd,
           current_monthly_spend_usd, spend_window_start_date, is_breached, breached_at
    FROM cost_caps ORDER BY service
  `)) as unknown as Array<Record<string, unknown>>;
  console.log('=== cost_caps ===');
  for (const c of caps) console.log(JSON.stringify(c));

  const spend = (await db.execute(sql`
    SELECT operation, count(*)::int AS calls, round(sum(cost_usd), 4) AS usd,
           min(occurred_at) AS first, max(occurred_at) AS last
    FROM api_call_log
    WHERE service = 'anthropic' AND occurred_at > now() - interval '24 hours'
    GROUP BY operation ORDER BY usd DESC NULLS LAST
  `)) as unknown as Array<Record<string, unknown>>;
  console.log('\n=== anthropic spend, last 24h (api_call_log) ===');
  for (const r of spend) console.log(JSON.stringify(r));

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
