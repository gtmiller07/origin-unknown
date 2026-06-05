/**
 * Cross-cultural cut — the fix for non-English under-tagging. Slices the SCORED video corpus by
 * declared channel/source origin (origin_country_codes) rather than detected language, because the
 * AI-film channels' short, English-ish titles detect as eng/null and collapse the cross-cultural
 * signal. Reports six-axis means for Western vs non-Western origin, for the AI challenger class and
 * the human-made incumbent class, over already-scored artifacts. Read-only — no scoring spend.
 *
 *   node --env-file=.env.local --import tsx scripts/analyze-cross-cultural.ts
 */
import { sql } from 'drizzle-orm';
import { useScriptDatabaseUrl } from './db-env';

// Western / global-North set (Anglosphere + Western Europe). The binarization is coarse by design;
// per-country data remains in origin_country_codes for finer cuts.
const WESTERN = [
  'US', 'CA', 'GB', 'IE', 'AU', 'NZ', 'DE', 'FR', 'ES', 'IT',
  'NL', 'BE', 'SE', 'NO', 'DK', 'FI', 'AT', 'CH', 'PT', 'LU',
];

const AXES = [
  'origin',
  'reach',
  'aesthetic_signal',
  'diplomatic_cross_boundary',
  'diplomatic_authenticity',
  'diplomatic_reciprocity',
];

interface Row {
  region: string;
  axis: string;
  mean: string;
  n: number;
}

function literalArray(values: string[]): string {
  // values are fixed constants (country codes / mediation labels), not user input — safe to inline.
  return `ARRAY[${values.map((v) => `'${v}'`).join(',')}]::text[]`;
}

async function main() {
  useScriptDatabaseUrl();
  const { db } = await import('../lib/db/client');

  const westernArr = sql.raw(literalArray(WESTERN));

  const cut = async (mediation: string[]): Promise<Row[]> =>
    (await db.execute(sql`
      SELECT
        CASE WHEN a.origin_country_codes && ${westernArr} THEN 'western' ELSE 'non_western' END AS region,
        s.axis AS axis,
        round(avg(coalesce(s.human_confirmed_value, s.value, s.ai_proposed_value)), 3) AS mean,
        count(*)::int AS n
      FROM scores s
      JOIN artifacts a ON a.id = s.artifact_id
      WHERE a.media_type = 'video'
        AND a.status = 'scored'
        AND a.origin_country_codes IS NOT NULL
        AND array_length(a.origin_country_codes, 1) > 0
        AND a.ai_mediation = ANY(${sql.raw(literalArray(mediation))})
      GROUP BY region, s.axis
    `)) as unknown as Row[];

  const challenger = await cut(['ai_generated', 'ai_assisted']);
  const incumbent = await cut(['human_made']);

  const print = (label: string, rows: Row[]) => {
    const m = new Map(rows.map((r) => [`${r.region}|${r.axis}`, r]));
    console.log(`\n=== ${label}: Western vs non-Western video (by origin_country_codes) ===`);
    console.log(`${'axis'.padEnd(28)}${'western'.padEnd(18)}${'non_western'.padEnd(18)}`);
    for (const ax of AXES) {
      const w = m.get(`western|${ax}`);
      const n = m.get(`non_western|${ax}`);
      console.log(
        ax.padEnd(28) +
          (w ? `${w.mean} (n=${w.n})` : '—').padEnd(18) +
          (n ? `${n.mean} (n=${n.n})` : '—').padEnd(18)
      );
    }
  };

  print('CHALLENGER (AI) video', challenger);
  print('INCUMBENT (human) video', incumbent);
  console.log('\nANALYSIS_DONE');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
