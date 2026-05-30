/**
 * Idempotent seed for the `mastodon` source category — the open, ungated grassroots/social-
 * discourse contrast class, the Fediverse stand-in for the credential-gated `reddit` category.
 * Like the other seeders, this matches on sources.name (which has no unique constraint): update
 * an existing row's config in place, otherwise insert. Names are suffixed "(Mastodon)" so they
 * never collide with another source category and clobber it.
 *
 * Each row is one instance + a themed bundle of hashtag timelines. Mastodon's public hashtag
 * API needs no credentials; the federated public timeline does, so it is left off. The adapter
 * pages each tag per run and the upsert dedups across runs. originCountryCodes is left unset on
 * purpose: a fediverse hashtag is a global, mixed-origin conversation, not a single-country
 * outlet, so the cultural-origin signal rides in each post's detected language instead.
 *
 * Every hashtag below was probed live (HTTP 200 with content) on mastodon.social before
 * inclusion. mastodon.social federates broadly, so these tag timelines pull in posts from
 * across the fediverse, not just its local accounts.
 *
 * Like db-verify, this runs against the real DB via MIGRATION_DATABASE_URL.
 *
 * Run with:  node --env-file=.env.local --import tsx scripts/seed-mastodon-sources.ts
 */
import { eq } from 'drizzle-orm';
import { type NewSource, sources } from '../lib/db/schema';
import type { MastodonSourceConfig } from '../lib/ingestion/types';
import { useScriptDatabaseUrl } from './db-env';

const CATEGORY = 'mastodon';
const INSTANCE = 'mastodon.social';

interface SeedSource {
  name: string;
  config: MastodonSourceConfig;
  notes: string;
}

const SEED: SeedSource[] = [
  {
    name: 'World Affairs & Geopolitics (Mastodon)',
    config: { instance: INSTANCE, hashtags: ['geopolitics', 'worldnews', 'diplomacy'] },
    notes:
      'Cross-national news and foreign-affairs discourse on the fediverse — the grassroots counterpart to state-media framing of world events.',
  },
  {
    name: 'Regional Discourse — China & Russia (Mastodon)',
    config: { instance: INSTANCE, hashtags: ['china', 'russia'] },
    notes:
      'Open social discourse about China and Russia — a contrast to those regions’ state media; in-scope non-English posts (Chinese, Russian) surface through language detection.',
  },
  {
    name: 'AI, Culture & Society (Mastodon)',
    config: { instance: INSTANCE, hashtags: ['ai', 'artificialintelligence', 'machinelearning'] },
    notes:
      'Public discourse about artificial intelligence and its cultural impact — how the AI mediation this project measures is itself debated.',
  },
  {
    name: 'Global Journalism & Press (Mastodon)',
    config: { instance: INSTANCE, hashtags: ['journalism', 'news', 'politics'] },
    notes:
      'Journalism, press-freedom, and political discourse on the fediverse — cross-border information flows outside institutional channels.',
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
