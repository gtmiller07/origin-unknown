/**
 * Flag 8 seed-corpus anchor artifacts as featured = true for the homepage rail.
 * Chosen to represent the dissertation's range: temporal spread (1955–2025), geographic
 * diversity (non-Western majority), and key thesis touchpoints (AI mediation, authenticity).
 * Idempotent. Run with: npm run seed:featured
 */
import { sql } from 'drizzle-orm';
import { useScriptDatabaseUrl } from './db-env';

// externalIds of the 8 featured anchors
const FEATURED_IDS = [
  'anchor-05-me-at-the-zoo',        // 2005 — the opening of the YouTube era
  'anchor-06-gangnam-style',        // 2012 — first non-Western video to cross 1B views
  'anchor-09-bts-spring-day',       // 2017 — high-reciprocity K-pop peak
  'anchor-22-dunhuang-digital-cave',// 2022 — state AI cultural-diplomacy case
  'anchor-21-calculating-empires',  // 2023 — the structural precedent
  'anchor-23-lelapa-ai',            // 2024 — the high-reciprocity counter-example
  'anchor-15-dcweekly-ai-propaganda', // 2025 — the negative case
  'anchor-20-paris-2024-ceremony',  // 2024 — state cultural diplomacy at scale
];

async function main() {
  useScriptDatabaseUrl();
  const { db } = await import('../lib/db/client');
  const { artifacts, sources } = await import('../lib/db/schema');

  // First clear all featured flags on seed corpus
  await db.execute(sql`
    UPDATE artifacts SET featured = false
    WHERE source_id = (SELECT id FROM sources WHERE name = 'Seed Corpus (curated)' LIMIT 1)
  `);

  let flagged = 0;
  for (const extId of FEATURED_IDS) {
    const result = await db.execute(sql`
      UPDATE artifacts SET featured = true
      WHERE external_id = ${extId}
        AND source_id = (SELECT id FROM sources WHERE name = 'Seed Corpus (curated)' LIMIT 1)
      RETURNING id::text
    `);
    if ((result as unknown[]).length > 0) flagged++;
    else console.log(`  not found: ${extId}`);
  }
  console.log(`Flagged ${flagged}/${FEATURED_IDS.length} artifacts as featured.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
