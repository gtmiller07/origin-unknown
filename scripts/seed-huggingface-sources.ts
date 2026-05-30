/**
 * Idempotent seed for the `genai_open_api` source category (Hugging Face Hub). Like the
 * other seeders, this matches on sources.name (which has no unique constraint): update an
 * existing row's config in place, otherwise insert. Names are suffixed "(Hugging Face)" so
 * they never collide with another source category and clobber it.
 *
 * Each row is a Hub query slice (a sort + optional tag filter), not a single outlet — the
 * adapter turns each into one list call per run. Origin country is intentionally left unset:
 * the Hub is a global, mixed-origin commons, which is rather the point.
 *
 * Like db-verify, this runs against the real DB via MIGRATION_DATABASE_URL.
 *
 * Run with:  node --env-file=.env.local --import tsx scripts/seed-huggingface-sources.ts
 */
import { eq } from 'drizzle-orm';
import { type NewSource, sources } from '../lib/db/schema';
import type { HuggingFaceSourceConfig } from '../lib/ingestion/types';
import { useScriptDatabaseUrl } from './db-env';

const CATEGORY = 'genai_open_api';

interface SeedSource {
  name: string;
  config: HuggingFaceSourceConfig;
  notes: string;
}

const SEED: SeedSource[] = [
  {
    name: 'Trending Text-Generation Models (Hugging Face)',
    config: { repoType: 'model', sort: 'trending', filter: 'text-generation', limit: 50 },
    notes:
      'Most trending open text-generation / LLM repos on the Hugging Face Hub — the supply side of generative text AI.',
  },
  {
    name: 'Trending Text-to-Image Models (Hugging Face)',
    config: { repoType: 'model', sort: 'trending', filter: 'text-to-image', limit: 50 },
    notes:
      'Most trending open text-to-image model repos on the Hugging Face Hub — the supply side of generative image AI.',
  },
  {
    name: 'Trending Translation Models (Hugging Face)',
    config: { repoType: 'model', sort: 'trending', filter: 'translation', limit: 50 },
    notes:
      'Most trending open machine-translation model repos on the Hugging Face Hub — AI mediating across languages and cultures.',
  },
  {
    name: 'Trending Datasets (Hugging Face)',
    config: { repoType: 'dataset', sort: 'trending', limit: 50 },
    notes:
      'Most trending open datasets on the Hugging Face Hub — the training data feeding generative AI.',
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

  console.log(`\n${SEED.length} ${CATEGORY} sources: ${inserted} inserted, ${updated} updated`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\nSeed failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
