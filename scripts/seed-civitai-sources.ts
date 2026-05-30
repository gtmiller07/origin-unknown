/**
 * Idempotent seed for Civitai slices within the `genai_open_api` source category. Civitai is
 * the *output* side of generative AI (actual AI-generated images + their prompts), the
 * companion to the Hugging Face *supply* side already seeded in this category. Like the other
 * seeders, this matches on sources.name (which has no unique constraint): update an existing
 * row's config in place, otherwise insert. Names are suffixed "(Civitai)" so they never
 * collide with the Hugging Face rows or another source category.
 *
 * Every row sets `provider: 'civitai'` so the genai_open_api dispatcher routes it to the
 * Civitai adapter (an absent provider would default to Hugging Face). Origin country is left
 * unset: Civitai is a global, mixed-origin commons — the cultural-origin signal rides in each
 * prompt's detected language, not a per-source country tag.
 *
 * Like db-verify, this runs against the real DB via MIGRATION_DATABASE_URL.
 *
 * Run with:  node --env-file=.env.local --import tsx scripts/seed-civitai-sources.ts
 */
import { eq } from 'drizzle-orm';
import { type NewSource, sources } from '../lib/db/schema';
import type { CivitaiSourceConfig } from '../lib/ingestion/types';
import { useScriptDatabaseUrl } from './db-env';

const CATEGORY = 'genai_open_api';

interface SeedSource {
  name: string;
  config: CivitaiSourceConfig;
  notes: string;
}

const SEED: SeedSource[] = [
  {
    name: 'Top AI Images This Week (Civitai)',
    config: { provider: 'civitai', sort: 'Most Reactions', period: 'Week', limit: 100 },
    notes:
      'The week’s most-reacted safe AI-generated images on Civitai — what is resonating right now in the open generative-image commons.',
  },
  {
    name: 'Most Discussed AI Images This Month (Civitai)',
    config: { provider: 'civitai', sort: 'Most Comments', period: 'Month', limit: 100 },
    notes:
      'The month’s most-commented safe AI-generated images on Civitai — the generative artifacts driving the most conversation.',
  },
  {
    name: 'Newest AI Images (Civitai)',
    config: { provider: 'civitai', sort: 'Newest', period: 'Week', limit: 100 },
    notes:
      'The freshest safe AI-generated images on Civitai — a steady incremental stream of new generative output, deduped across runs.',
  },
];

async function main() {
  useScriptDatabaseUrl();
  const { db } = await import('../lib/db/client');

  let inserted = 0;
  let updated = 0;

  for (const seed of SEED) {
    const config = seed.config;
    const existing = await db
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.name, seed.name));

    if (existing.length) {
      await db
        .update(sources)
        .set({
          category: CATEGORY,
          config,
          enabled: true,
          notes: seed.notes,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(sources.id, existing[0].id));
      updated += 1;
      console.log(`updated   ${seed.name}`);
    } else {
      const row: NewSource = {
        name: seed.name,
        category: CATEGORY,
        config,
        enabled: true,
        notes: seed.notes,
      };
      await db.insert(sources).values(row);
      inserted += 1;
      console.log(`inserted  ${seed.name}`);
    }
  }

  console.log(
    `\n${SEED.length} Civitai ${CATEGORY} sources: ${inserted} inserted, ${updated} updated`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('\nSeed failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
