/**
 * Idempotent seed for the `bluesky` source category. Like seed-rss-sources, this
 * matches on sources.name (which has no unique constraint): update an existing
 * row's config in place, otherwise insert. Names are suffixed "(Bluesky)" so they
 * never collide with the same outlet's RSS source and clobber it.
 *
 * Every handle below was probed live via the public AppView (getProfile resolved
 * to the real, active official account) before inclusion.
 *
 * Like db-verify, this runs against the real DB via MIGRATION_DATABASE_URL.
 *
 * Run with:  node --env-file=.env.local --import tsx scripts/seed-bluesky-sources.ts
 */
import { eq } from 'drizzle-orm';
import { type NewSource, sources } from '../lib/db/schema';
import type { BlueskySourceConfig } from '../lib/ingestion/types';
import { useScriptDatabaseUrl } from './db-env';

const CATEGORY = 'bluesky';

interface SeedSource {
  name: string;
  config: BlueskySourceConfig;
  notes: string;
}

const SEED: SeedSource[] = [
  {
    name: 'Al Jazeera English (Bluesky)',
    config: { actors: ['aljazeera.com'], originCountryCodes: ['QA'] },
    notes: 'Qatari state-funded international broadcaster; official Bluesky account.',
  },
  {
    name: 'France 24 (Bluesky)',
    config: { actors: ['france24.com'], originCountryCodes: ['FR'] },
    notes: 'French public international broadcaster (France Médias Monde); official account.',
  },
  {
    name: 'RFI (Bluesky)',
    config: { actors: ['rfi.fr'], originCountryCodes: ['FR'] },
    notes: 'Radio France Internationale; official Bluesky account.',
  },
  {
    name: 'NPR (Bluesky)',
    config: { actors: ['npr.org'], originCountryCodes: ['US'] },
    notes: 'US public media (National Public Radio); official Bluesky account.',
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
