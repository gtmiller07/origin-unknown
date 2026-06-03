/**
 * Idempotent seed for the `vimeo` source category — curated/creator video, a counterpart to
 * the broadcaster-heavy YouTube set and a likely home for AI-generated short films. Like the
 * other seeders, this matches on sources.name (no unique constraint): update an existing row's
 * config in place, otherwise insert. Names are suffixed "(Vimeo)".
 *
 * These are open-SEARCH sources, so they carry NO ai_mediation prior: a search match is not
 * proof of AI origin, so the relevance gate and scorer classify each video per artifact (more
 * rigorous than assuming the whole feed is AI). A known AI-creator Vimeo channel would instead
 * set `channel` + `aiMediation: 'ai_assisted'` to enter the challenger class directly.
 *
 * The Vimeo adapter needs VIMEO_ACCESS_TOKEN (developer.vimeo.com → an app → an access token
 * with the "public" scope); without it ingestion degrades to empty, so seed first and the
 * token lights it up. Like db-verify, this runs against the real DB via MIGRATION_DATABASE_URL.
 *
 * Run with:  node --env-file=.env.local --import tsx scripts/seed-vimeo-sources.ts
 */
import { eq } from 'drizzle-orm';
import { type NewSource, sources } from '../lib/db/schema';
import type { VimeoSourceConfig } from '../lib/ingestion/types';
import { useScriptDatabaseUrl } from './db-env';

const CATEGORY = 'vimeo';

interface SeedSource {
  name: string;
  config: VimeoSourceConfig;
  notes: string;
}

const SEED: SeedSource[] = [
  {
    name: 'AI-Generated Film Search (Vimeo)',
    config: { query: 'AI generated film', sort: 'relevant', perPage: 50 },
    notes:
      'Open search for AI-generated films on Vimeo. No ai_mediation prior — a search match is not proof of AI origin, so the gate/scorer classify each video per artifact.',
  },
  {
    name: 'Generative AI Shorts Search (Vimeo)',
    config: { query: 'generative AI short film', sort: 'relevant', perPage: 50 },
    notes:
      'Open search for generative-AI short films on Vimeo — a discovery feed; per-video classification by the gate/scorer.',
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
