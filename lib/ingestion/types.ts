/**
 * Shared contracts for the ingestion pipeline. Every source adapter produces
 * NormalizedArtifact[]; the run orchestrator persists them and records the run.
 */

export interface NormalizedArtifact {
  /** Stable identifier within the source; the (sourceId, externalId) upsert key. */
  externalId: string;
  title?: string | null;
  description?: string | null;
  contentUrl?: string | null;
  thumbnailUrl?: string | null;
  mediaType?: string | null;
  /** ISO 639-3 language codes (franc output). */
  languageCodes?: string[] | null;
  /** ISO 3166-1 alpha-2 country codes for the originating outlet. */
  originCountryCodes?: string[] | null;
  /** ISO-8601 timestamp string (schema stores timestamptz in string mode). */
  publishedAt?: string | null;
  isAiGenerated?: boolean | null;
  rawPayload?: unknown;
}

export interface IngestError {
  feed?: string;
  message: string;
}

export interface FetchResult {
  items: NormalizedArtifact[];
  errors: IngestError[];
}

export type RunStatus = 'success' | 'partial' | 'failed' | 'skipped';

export interface RunSummary {
  sourceId: string;
  name: string;
  status: RunStatus;
  ingested: number;
  errors: IngestError[];
  /** Human-readable reason when a source did not run, e.g. a rate-limit skip. */
  note?: string;
}

export interface RssSourceConfig {
  feeds: string[];
  originCountryCodes?: string[];
}

export interface BlueskySourceConfig {
  /** Handles (e.g. 'xinhua.bsky.social') or DIDs whose author feeds are pulled. */
  actors: string[];
  /** ISO 3166-1 alpha-2 codes applied to every artifact from this source. */
  originCountryCodes?: string[];
  /** Include the account's reposts of others (default false: authored posts only). */
  includeReposts?: boolean;
}

export interface YoutubeSourceConfig {
  /** YouTube channel IDs (UC…) whose recent uploads are ingested. */
  channelIds: string[];
  /** ISO 3166-1 alpha-2 codes applied to every artifact from this source. */
  originCountryCodes?: string[];
}

export interface RedditSourceConfig {
  /** Subreddit names without the leading "r/" (e.g. 'china', 'worldnews'). */
  subreddits: string[];
  /** ISO 3166-1 alpha-2 codes applied to every artifact from this source. */
  originCountryCodes?: string[];
  /** Listing to pull; defaults to 'new' (chronological, best for incremental ingest). */
  listing?: 'new' | 'hot' | 'top';
}
