/**
 * Idempotent seed for the `reddit` source category — the grassroots/social-discourse contrast
 * class against the state-media and institutional sources. Like the other seeders, this matches
 * on sources.name (which has no unique constraint): update an existing row's config in place,
 * otherwise insert. Names are suffixed "(Reddit)" so they never collide with another source
 * category and clobber it.
 *
 * Each row is a themed bundle of subreddits, not a single community — the adapter pages each
 * subreddit's listing per run and the upsert dedups across runs. originCountryCodes is left
 * unset on purpose: a subreddit is a global, mixed-origin conversation, not a single-country
 * outlet, so unlike state media there is no honest per-source origin tag (the cultural-origin
 * signal instead rides in each post's detected language).
 *
 * The Reddit adapter needs REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET (an app-only OAuth app);
 * without them ingestion degrades to empty, so seed first and the credentials light it up.
 *
 * Like db-verify, this runs against the real DB via MIGRATION_DATABASE_URL.
 *
 * Run with:  node --env-file=.env.local --import tsx scripts/seed-reddit-sources.ts
 */
import { eq } from 'drizzle-orm';
import { type NewSource, sources } from '../lib/db/schema';
import type { RedditSourceConfig } from '../lib/ingestion/types';
import { useScriptDatabaseUrl } from './db-env';

const CATEGORY = 'reddit';

interface SeedSource {
  name: string;
  config: RedditSourceConfig;
  notes: string;
}

const SEED: SeedSource[] = [
  {
    name: 'World Affairs & Geopolitics (Reddit)',
    config: { subreddits: ['geopolitics', 'worldnews'], listing: 'new' },
    notes:
      'Cross-national news and analysis discourse — the grassroots counterpart to state-media framing of world events.',
  },
  {
    name: 'Regional Discourse — China & Korea (Reddit)',
    config: { subreddits: ['China', 'korea'], listing: 'new' },
    notes:
      'Open social discourse about China and Korea — a contrast to the East Asian state-media outlets already seeded.',
  },
  {
    name: 'Regional Discourse — Russia, Iran & Middle East (Reddit)',
    config: { subreddits: ['russia', 'iran', 'AskMiddleEast'], listing: 'new' },
    notes:
      'Open social discourse from/about Russia, Iran, and the wider Middle East — a contrast to those regions’ state media.',
  },
  {
    name: 'AI, Culture & Society (Reddit)',
    config: { subreddits: ['artificial', 'singularity'], listing: 'new' },
    notes:
      'Public discourse about artificial intelligence and its cultural impact — how the AI mediation this project measures is itself debated.',
  },
  // User-generated *content*, not just discourse — the two storytelling classes the research
  // question turns on. Tagged with an ai_mediation prior so they classify at ingest instead of
  // landing ambiguous: AI-generation communities → challenger (ai_assisted), human-fiction
  // communities → incumbent (human_made). (Dormant until REDDIT_CLIENT_ID/SECRET are set.)
  {
    name: 'AI-Generated Media (Reddit)',
    config: {
      subreddits: ['aivideo', 'StableDiffusion', 'midjourney', 'aiArt'],
      listing: 'new',
      aiMediation: 'ai_assisted',
    },
    notes:
      'User-generated AI image/video communities — the Reddit counterpart to Civitai and the AI-film YouTube channels. Human creators sharing generative output (media_type tags video vs image per post). The grassroots AI-UGC challenger class.',
  },
  {
    name: 'Human Storytelling (Reddit)',
    config: {
      subreddits: ['WritingPrompts', 'nosleep', 'shortstories'],
      listing: 'new',
      aiMediation: 'human_made',
    },
    notes:
      'Grassroots human creative writing and fiction — the human-authored storytelling baseline against the AI-generated challenger UGC, distinct from institutional human sources (state media, museums).',
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
