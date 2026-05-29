/**
 * Idempotent seed for the state_media_rss source category. sources.name has no
 * unique constraint, so we match on name: update an existing row's config in
 * place, otherwise insert. Feed URLs below were each probed live (HTTP 200 +
 * parseable RSS/Atom/RDF) before inclusion.
 *
 * Like db-verify, this runs against the real DB via MIGRATION_DATABASE_URL.
 *
 * Run with:  node --env-file=.env.local --import tsx scripts/seed-rss-sources.ts
 */
import { eq } from 'drizzle-orm';
import { type NewSource, sources } from '../lib/db/schema';
import type { RssSourceConfig } from '../lib/ingestion/types';
import { useScriptDatabaseUrl } from './db-env';

const CATEGORY = 'state_media_rss';

interface SeedSource {
  name: string;
  config: RssSourceConfig;
  notes: string;
}

const SEED: SeedSource[] = [
  // --- China ---
  {
    name: 'CGTN',
    config: {
      feeds: ['https://www.cgtn.com/subscribe/rss/section/world.xml'],
      originCountryCodes: ['CN'],
    },
    notes: 'China Global Television Network (state broadcaster), World section.',
  },
  {
    name: 'China Daily',
    config: {
      feeds: [
        'http://www.chinadaily.com.cn/rss/world_rss.xml',
        'http://www.chinadaily.com.cn/rss/china_rss.xml',
      ],
      originCountryCodes: ['CN'],
    },
    notes: 'State-owned English daily; World + China desks.',
  },
  {
    name: 'Global Times',
    config: { feeds: ['https://www.globaltimes.cn/rss/outbrain.xml'], originCountryCodes: ['CN'] },
    notes: 'CPC-affiliated tabloid (People’s Daily group).',
  },
  {
    name: "People's Daily",
    config: { feeds: ['http://en.people.cn/rss/90777.xml'], originCountryCodes: ['CN'] },
    notes: 'Official CPC newspaper, English edition.',
  },
  {
    name: 'Xinhua',
    config: { feeds: ['https://english.news.cn/rss/worldrss.xml'], originCountryCodes: ['CN'] },
    notes: 'State news agency, English World feed.',
  },
  // --- Russia ---
  {
    name: 'RT',
    config: { feeds: ['https://www.rt.com/rss/'], originCountryCodes: ['RU'] },
    notes: 'State-funded international broadcaster (formerly Russia Today).',
  },
  {
    name: 'TASS',
    config: { feeds: ['https://tass.com/rss/v2.xml'], originCountryCodes: ['RU'] },
    notes: 'Russian state news agency, English service.',
  },
  {
    name: 'Sputnik',
    config: {
      feeds: ['https://sputnikglobe.com/export/rss2/archive/index.xml'],
      originCountryCodes: ['RU'],
    },
    notes: 'State-funded international wire (Rossiya Segodnya).',
  },
  // --- Qatar ---
  {
    name: 'Al Jazeera English',
    config: { feeds: ['https://www.aljazeera.com/xml/rss/all.xml'], originCountryCodes: ['QA'] },
    notes: 'Qatari state-funded international broadcaster.',
  },
  // --- Turkey ---
  {
    name: 'Anadolu Agency',
    config: {
      feeds: ['https://www.aa.com.tr/en/rss/default?cat=guncel'],
      originCountryCodes: ['TR'],
    },
    notes: 'Turkish state news agency, English service.',
  },
  {
    name: 'Daily Sabah',
    config: { feeds: ['https://www.dailysabah.com/rssFeed/home'], originCountryCodes: ['TR'] },
    notes: 'Pro-government Turkish English daily.',
  },
  // --- Iran ---
  {
    name: 'Press TV',
    config: { feeds: ['https://www.presstv.ir/rss.xml'], originCountryCodes: ['IR'] },
    notes: 'Iranian state English-language broadcaster (IRIB).',
  },
  {
    name: 'Mehr News',
    config: { feeds: ['https://en.mehrnews.com/rss'], originCountryCodes: ['IR'] },
    notes: 'Iranian semi-official news agency, English service.',
  },
  {
    name: 'IRNA',
    config: { feeds: ['https://en.irna.ir/rss'], originCountryCodes: ['IR'] },
    notes: 'Islamic Republic News Agency (official), English service.',
  },
  // --- Germany ---
  {
    name: 'Deutsche Welle',
    config: { feeds: ['https://rss.dw.com/rdf/rss-en-all'], originCountryCodes: ['DE'] },
    notes: 'German public international broadcaster; RSS 1.0/RDF feed.',
  },
  // --- France ---
  {
    name: 'France 24 English',
    config: { feeds: ['https://www.france24.com/en/rss'], originCountryCodes: ['FR'] },
    notes: 'French public international broadcaster (France Médias Monde).',
  },
  {
    name: 'RFI English',
    config: { feeds: ['https://www.rfi.fr/en/rss'], originCountryCodes: ['FR'] },
    notes: 'Radio France Internationale, English service.',
  },
  // --- United Kingdom ---
  {
    name: 'BBC World',
    config: { feeds: ['https://feeds.bbci.co.uk/news/world/rss.xml'], originCountryCodes: ['GB'] },
    notes: 'UK public broadcaster; World Service is a cultural-diplomacy baseline.',
  },
  // --- South Korea ---
  {
    name: 'Yonhap',
    config: { feeds: ['https://en.yna.co.kr/RSS/news.xml'], originCountryCodes: ['KR'] },
    notes: 'Semi-governmental South Korean news agency, English service.',
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
