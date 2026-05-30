/**
 * Idempotent seed for the `cultural_institution` source category — open-access museum
 * collections, the high-provenance documented-human-heritage contrast to AI-generated content.
 * Like the other seeders, this matches on sources.name (which has no unique constraint): update
 * an existing row's config in place, otherwise insert. Names are suffixed with the museum so
 * they never collide with another source category and clobber it.
 *
 * Composition (chosen after probing both APIs live):
 *   - Cleveland is the workhorse. Its one-step search returns full objects whose `culture` array
 *     names the origin cleanly (Korea→KR, Iran→IR, Egypt→EG at ~12–15/15), and it never rate-
 *     limits, so it carries the bulk of the origin coverage across 8 slices.
 *   - The Met contributes only its two cleanest, most iconic collections: Egyptian (queried with
 *     no department filter — adding one collapses it to ~1 result) and Persian (department 14,
 *     Islamic Art, where the keyword query is IR-dominant). The Met's full-text search has no
 *     culture facet, so broad culture-adjective queries ("Chinese", "Korean") return a polluted
 *     mix; we avoid those and keep the Met footprint small. Each Met slice is capped at limit 40
 *     because the Met's edge rate-limits aggressively on cumulative request volume per run and
 *     objects must be fetched serially (see lib/ingestion/cultural.ts). Egypt and Iran are seeded
 *     on BOTH museums on purpose — a cross-institution robustness check on shared origins where
 *     both APIs are clean.
 *
 * Unlike every other category, originCountryCodes is NOT set here: each object carries its own
 * documented origin, which the adapter derives per-object from the museum's culture/country
 * field. The query is the only research-design knob — the recorded per-object origin is the truth,
 * and the slice name is just a sourcing bucket, never an origin claim.
 *
 * Every query below was probed live (healthy result counts, HTTP 200) before inclusion. Like
 * db-verify, this runs against the real DB via MIGRATION_DATABASE_URL.
 *
 * Run with:  node --env-file=.env.local --import tsx scripts/seed-cultural-sources.ts
 */
import { eq } from 'drizzle-orm';
import { type NewSource, sources } from '../lib/db/schema';
import type { ClevelandSourceConfig, MetSourceConfig } from '../lib/ingestion/types';
import { useScriptDatabaseUrl } from './db-env';

const CATEGORY = 'cultural_institution';

interface SeedSource {
  name: string;
  config: MetSourceConfig | ClevelandSourceConfig;
  notes: string;
}

const SEED: SeedSource[] = [
  // ---- Cleveland Museum of Art (one-step API, clean per-origin pools, no rate-limiting) ----
  {
    name: 'Japanese Art (Cleveland)',
    config: { provider: 'cleveland', query: 'Japan' },
    notes:
      'Cleveland objects of Japanese origin — keyless CC0; per-object origin from the culture field (probed ~13/15 JP).',
  },
  {
    name: 'Chinese Art (Cleveland)',
    config: { provider: 'cleveland', query: 'China' },
    notes:
      'Cleveland objects of Chinese origin — keyless CC0; per-object documented origin (~13/15 CN).',
  },
  {
    name: 'French & European Art (Cleveland)',
    config: { provider: 'cleveland', query: 'France' },
    notes:
      'Cleveland objects of French / Western European origin — keyless CC0; per-object origin (~13/15 FR).',
  },
  {
    name: 'Korean Art (Cleveland)',
    config: { provider: 'cleveland', query: 'Korea' },
    notes:
      'Cleveland objects of Korean origin — keyless CC0; clean per-object origin (probed 15/15 KR), where the Met keyword search is weak.',
  },
  {
    name: 'Indian & South Asian Art (Cleveland)',
    config: { provider: 'cleveland', query: 'India' },
    notes:
      'Cleveland objects of South Asian / Indian origin — keyless CC0; per-object origin (~9/15 IN, rest null/British-Raj), where the Met keyword search returns mostly non-Indian objects.',
  },
  {
    name: 'Egyptian Art (Cleveland)',
    config: { provider: 'cleveland', query: 'Egypt' },
    notes:
      'Cleveland objects of Egyptian origin — keyless CC0; clean per-object origin (probed 15/15, EG-dominant). Cross-institution pair with the Met Egyptian slice.',
  },
  {
    name: 'Persian & Iranian Art (Cleveland)',
    config: { provider: 'cleveland', query: 'Iran' },
    notes:
      'Cleveland objects of Iranian / Persian origin — keyless CC0; clean per-object origin (probed 15/15 IR). Cross-institution pair with the Met Persian slice.',
  },
  {
    name: 'Turkish & Ottoman Art (Cleveland)',
    config: { provider: 'cleveland', query: 'Turkey' },
    notes:
      'Cleveland objects of Turkish / Ottoman origin — keyless CC0; per-object origin (probed ~12/15 TR).',
  },
  // ---- The Metropolitan Museum of Art (two-step API; only its cleanest collections, capped) ----
  {
    name: 'Egyptian Art (Met)',
    config: { provider: 'met', query: 'Egyptian', limit: 40 },
    notes:
      'Met objects of Egyptian origin (ancient culture mapped to its modern heartland, EG) — keyless CC0. No department filter (adding one collapses the result set); probed ~10/15 EG. Capped at 40 and fetched serially to respect the Met rate limit.',
  },
  {
    name: 'Persian & Islamic Art (Met)',
    config: { provider: 'met', query: 'Persian', departmentId: 14, limit: 40 },
    notes:
      'Met objects of Persian / Islamic-world origin — keyless CC0. Anchored to department 14 (Islamic Art) where the keyword query is IR-dominant (probed 10–15/15 IR); per-object origin (Iran, etc.) from the culture field. Capped at 40 and fetched serially.',
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
