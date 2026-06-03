/**
 * Idempotent seed for the `youtube_api` source category. Like seed-bluesky-sources,
 * this matches on sources.name (which has no unique constraint): update an existing
 * row's config in place, otherwise insert. Names are suffixed "(YouTube)" so they
 * never collide with the same outlet's RSS/Bluesky source and clobber it.
 *
 * Every channel below was resolved live via the YouTube Data API (channels.list
 * forHandle/forUsername) to its canonical UC… id and vetted — real, active, official
 * account with a substantial upload history — before inclusion. Squatters and
 * deplatformed outlets (RFI, Press TV, RT) were probed and rejected.
 *
 * Like db-verify, this runs against the real DB via MIGRATION_DATABASE_URL.
 *
 * Run with:  node --env-file=.env.local --import tsx scripts/seed-youtube-sources.ts
 */
import { eq } from 'drizzle-orm';
import { type NewSource, sources } from '../lib/db/schema';
import type { YoutubeSourceConfig } from '../lib/ingestion/types';
import { useScriptDatabaseUrl } from './db-env';

const CATEGORY = 'youtube_api';

interface SeedSource {
  name: string;
  config: YoutubeSourceConfig;
  notes: string;
}

const SEED: SeedSource[] = [
  {
    name: 'Al Jazeera English (YouTube)',
    config: { channelIds: ['UCNye-wNBqNL5ZzHSJj3l8Bg'], originCountryCodes: ['QA'] },
    notes: 'Qatari state-funded international broadcaster; official YouTube channel.',
  },
  {
    name: 'France 24 English (YouTube)',
    config: { channelIds: ['UCQfwfsi5VrQ8yKZ-UWmAEFg'], originCountryCodes: ['FR'] },
    notes:
      'French public international broadcaster (France Médias Monde); official English channel.',
  },
  {
    name: 'DW News (YouTube)',
    config: { channelIds: ['UCknLrEdhRCp1aegoMqRaCZg'], originCountryCodes: ['DE'] },
    notes:
      'German public international broadcaster (Deutsche Welle); official English news channel.',
  },
  {
    name: 'NPR (YouTube)',
    config: { channelIds: ['UCJnS2EsPfv46u1JR8cnD0NA'], originCountryCodes: ['US'] },
    notes: 'US public media (National Public Radio); official YouTube channel.',
  },
  {
    name: 'CGTN (YouTube)',
    config: { channelIds: ['UCgrNz-aDmcr2uuto8_DL2jg'], originCountryCodes: ['CN'] },
    notes: 'Chinese state broadcaster (China Global Television Network); official YouTube channel.',
  },
  {
    name: 'TRT World (YouTube)',
    config: { channelIds: ['UC7fWeaHhqgM4Ry-RMpM2YYw'], originCountryCodes: ['TR'] },
    notes: 'Turkish public broadcaster (TRT); official English news channel.',
  },
  {
    name: 'Arirang News (YouTube)',
    config: { channelIds: ['UCzznO4xSV8BKnUBPyswtCUw'], originCountryCodes: ['KR'] },
    notes: 'South Korean public diplomacy broadcaster (Arirang); official English news channel.',
  },
  // AI-film creator channels — the AI-mediated moving-image *challenger* class (human-directed,
  // AI-generated video), tagged ai_assisted so they classify as challengers at ingest rather
  // than landing ambiguous. Distinct from the state/public broadcasters above (the incumbent
  // baseline). Channel ids resolved + vetted live via the YouTube Data API.
  {
    name: 'The Dor Brothers (YouTube)',
    config: {
      channelIds: ['UCNMK68M-Al4hRUcew07TnUA'],
      originCountryCodes: ['DE'],
      aiMediation: 'ai_assisted',
    },
    notes:
      'Berlin AI-film studio (Runway/Veo-driven narrative shorts, music videos, satire). Human-directed, AI-generated video → challenger class. Tens of millions of views.',
  },
  {
    name: 'Neural Viz (YouTube)',
    config: { channelIds: ['UCC84bgs01Qv2S7byU2rUYig'], aiMediation: 'ai_assisted' },
    notes:
      'AI-generated mockumentary universe ("The Monoverse"): human-scripted/directed, AI-generated characters and footage → challenger class. Origin unstated (left unset).',
  },
  {
    name: 'AI on the Lot (YouTube)',
    config: {
      channelIds: ['UC1zhq4BVqLNyk61y9X2jhOw'],
      originCountryCodes: ['US'],
      aiMediation: 'ai_assisted',
    },
    notes:
      'US showcase of AI-assisted short films from working filmmakers. Human authorship with material generative-AI involvement → challenger class.',
  },
  // Second AI-film/AI-music cohort (2026-06-03): more creators + cross-cultural origin (GB, SG)
  // and the music medium. Channel ids resolved + vetted live via the YouTube Data API
  // (subscriber count + activity); content-farm and tutorial channels were rejected.
  {
    name: 'Curious Refuge (YouTube)',
    config: {
      channelIds: ['UClnFtyUEaxQOCd1s5NKYGFA'],
      originCountryCodes: ['US'],
      aiMediation: 'ai_assisted',
    },
    notes:
      'The central AI-filmmaking community + host of the AI Film Festival (266K subs). Mixed showcase/education — AI films and festival reels alongside technique breakdowns; the relevance gate and scorer sort per video.',
  },
  {
    name: 'Epic AI Films (YouTube)',
    config: {
      channelIds: ['UC5FCyk1QkTBLgWm-w866PGg'],
      originCountryCodes: ['GB'],
      aiMediation: 'ai_assisted',
    },
    notes:
      'UK AI filmmaker redefining independent film with generative tools (91K subs) — narrative AI cinema, British origin.',
  },
  {
    name: 'Nova AI Films (YouTube)',
    config: {
      channelIds: ['UCoxrPSs31xUUJOYzrZhEi7g'],
      originCountryCodes: ['US'],
      aiMediation: 'ai_assisted',
    },
    notes:
      'AI storytelling / cinematic shorts creator (54K subs) — human-directed, AI-generated narrative video.',
  },
  {
    name: 'Director Dave Clark (YouTube)',
    config: { channelIds: ['UCqrWkLKwRKNZRbbJXVEvAjw'], aiMediation: 'ai_assisted' },
    notes:
      'Named AI filmmaker (“Borrowing Time”) publishing generative-AI film explorations (22K subs); origin unstated.',
  },
  {
    name: 'AI Music Video — Chinese (YouTube)',
    config: {
      channelIds: ['UCGTFAwLA-8vpGUEBeS-GJeQ'],
      originCountryCodes: ['SG'],
      aiMediation: 'ai_assisted',
    },
    notes:
      'High-volume Chinese-language AI music-video channel (55K subs, Singapore) — the music medium plus a non-English, Asian-origin AI creator, both otherwise thin in the challenger class.',
  },
  // Cross-cultural AI-film cohort (2026-06-03): non-English AI creators, to correct the
  // mono-English skew of the challenger class. Substantial creators only (nascent 1-2-video
  // channels skipped); Arabic + Korean AI-film were probed and found barely emergent. Ids
  // resolved + vetted via the YouTube Data API. Origin is the cultural origin where defensible;
  // the detected language carries the cross-cultural signal regardless.
  {
    name: 'AI Cinema — EL IAS [Spanish] (YouTube)',
    config: {
      channelIds: ['UCMgXcDVqRVpL0a65jQRV2kg'],
      originCountryCodes: ['ES'],
      aiMediation: 'ai_assisted',
    },
    notes:
      'Spanish AI-cinema channel (40K subs) — "IA aplicada al cine"; the largest non-English AI-film creator found.',
  },
  {
    name: 'AI Storytelling — Anomalía Ai [Spanish] (YouTube)',
    config: { channelIds: ['UCyLfLxtsFlapE2vxh3vnyrA'], aiMediation: 'ai_assisted' },
    notes:
      'Spanish-language AI visual storyteller (21K subs); region unstated, so origin rides in the detected language.',
  },
  {
    name: 'AI Films — Sanatan [Hindi] (YouTube)',
    config: {
      channelIds: ['UC9FW6x-Hwq_qdiA94o8Ex4Q'],
      originCountryCodes: ['IN'],
      aiMediation: 'ai_assisted',
    },
    notes:
      'Hindi AI films on Indian/dharmic themes (4.5K subs; diaspora creator, Indian cultural origin).',
  },
  {
    name: 'AI Films — AI導演研究所 [Chinese/TW] (YouTube)',
    config: {
      channelIds: ['UCvDDRCRr7L89w8fgCqQHIAA'],
      originCountryCodes: ['TW'],
      aiMediation: 'ai_assisted',
    },
    notes:
      'Traditional-Chinese AI "director studio" (Taiwan, 3.2K subs, 196 videos) — a non-mainland Chinese-language AI-film voice.',
  },
  {
    name: 'AI Films — UnderGround [Portuguese/BR] (YouTube)',
    config: {
      channelIds: ['UCRp97lxoUd2lNUxvcasimdg'],
      originCountryCodes: ['BR'],
      aiMediation: 'ai_assisted',
    },
    notes: 'Brazilian Portuguese AI films (1.6K subs) — Lusophone Latin-American AI storytelling.',
  },
  {
    name: 'AI Films — 追光剧场 [Chinese/CN] (YouTube)',
    config: {
      channelIds: ['UC4qqBg-pq-FPhntF3V3Rj5g'],
      originCountryCodes: ['CN'],
      aiMediation: 'ai_assisted',
    },
    notes:
      'Mainland-Chinese AI cinematic storytelling (simplified Chinese; small/nascent but the clearest mainland-CN AI-film voice found).',
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
