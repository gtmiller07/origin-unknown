/**
 * Manual ingestion runner: runs every enabled source in a category through its
 * adapter and writes artifacts + ingestion_runs, exactly like the cron route.
 *
 * Run with:  node --env-file=.env.local --import tsx scripts/ingest.ts [category]
 * Defaults to state_media_rss.
 */
import type { Source } from '../lib/db/schema';
import { fetchBlueskyArtifacts } from '../lib/ingestion/bluesky';
import { fetchCulturalArtifacts } from '../lib/ingestion/cultural';
import { fetchGenaiOpenArtifacts } from '../lib/ingestion/genai-open';
import { fetchMastodonArtifacts } from '../lib/ingestion/mastodon';
import { fetchRedditArtifacts } from '../lib/ingestion/reddit';
import { fetchRssArtifacts } from '../lib/ingestion/rss';
import type { FetchResult } from '../lib/ingestion/types';
import { fetchVimeoArtifacts } from '../lib/ingestion/vimeo';
import { fetchYoutubeArtifacts } from '../lib/ingestion/youtube';
import { useScriptDatabaseUrl } from './db-env';

const FETCHERS: Record<string, (source: Source) => Promise<FetchResult>> = {
  state_media_rss: fetchRssArtifacts,
  bluesky: fetchBlueskyArtifacts,
  youtube_api: fetchYoutubeArtifacts,
  reddit: fetchRedditArtifacts,
  mastodon: fetchMastodonArtifacts,
  genai_open_api: fetchGenaiOpenArtifacts,
  cultural_institution: fetchCulturalArtifacts,
  vimeo: fetchVimeoArtifacts,
};

async function main() {
  const category = process.argv[2] ?? 'state_media_rss';
  const fetcher = FETCHERS[category];
  if (!fetcher) {
    throw new Error(
      `No fetcher for category "${category}". Known: ${Object.keys(FETCHERS).join(', ')}`
    );
  }

  useScriptDatabaseUrl();
  const { ingestCategory } = await import('../lib/ingestion/run');

  console.log(`\nIngesting category: ${category}\n`);
  const results = await ingestCategory(category, fetcher);

  let total = 0;
  for (const r of results) {
    total += r.ingested;
    const errs = r.errors.length
      ? `  errors: ${r.errors.map((e) => `${e.feed ?? ''} ${e.message}`.trim()).join('; ')}`
      : '';
    console.log(`  [${r.status.padEnd(7)}] ${r.name.padEnd(22)} ingested=${r.ingested}${errs}`);
  }
  console.log(`\n${results.length} sources, ${total} artifacts ingested.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\nIngest failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
