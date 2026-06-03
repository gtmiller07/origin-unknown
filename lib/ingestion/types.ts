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

/**
 * Authorship-origin prior a source may assert on all of its artifacts at ingest, in the
 * project's ai_mediation taxonomy: 'ai_generated' (fully synthetic output, e.g. Civitai),
 * 'ai_assisted' (human authorship with material generative-AI involvement, e.g. an
 * AI-filmmaking channel), 'human_made' (no AI), 'unknown' (unasserted). Persisted as the
 * artifact's ai_mediation with provenance 'source_prior'; a later scoring pass may override.
 */
export type AiMediation = 'ai_generated' | 'ai_assisted' | 'human_made' | 'unknown';

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
  /**
   * Authorship-origin prior for every video from this source. YouTube hosts both human and
   * AI-mediated video, so — unlike Civitai, which has a blanket per-adapter AI-generated flag
   * — an AI-film channel must declare 'ai_assisted'/'ai_generated' here to be classed as a
   * challenger at ingest. Absent means unasserted (the video stays ambiguous → relevance gate).
   */
  aiMediation?: AiMediation;
}

export interface RedditSourceConfig {
  /** Subreddit names without the leading "r/" (e.g. 'china', 'worldnews'). */
  subreddits: string[];
  /** ISO 3166-1 alpha-2 codes applied to every artifact from this source. */
  originCountryCodes?: string[];
  /** Listing to pull; defaults to 'new' (chronological, best for incremental ingest). */
  listing?: 'new' | 'hot' | 'top';
  /**
   * Authorship-origin prior for every post from this bundle. Reddit is mostly human discourse,
   * but dedicated AI-generation communities (r/aivideo, r/StableDiffusion…) are user-generated
   * AI content — set 'ai_assisted' to class them as challengers at ingest; set 'human_made' for
   * human-storytelling bundles (r/WritingPrompts…). Absent = unasserted (ambiguous → gate).
   */
  aiMediation?: AiMediation;
}

/**
 * Mastodon (Fediverse / ActivityPub) — the open, ungated grassroots social-discourse source.
 * One source reads one instance's public timelines: each configured hashtag timeline plus,
 * optionally, the federated public timeline. Public reads need no credentials, so unlike
 * Reddit there is no API gate.
 */
export interface MastodonSourceConfig {
  /** Instance host to read from, e.g. 'mastodon.social' (scheme and trailing slash optional). */
  instance: string;
  /** Hashtags without the leading '#' (e.g. 'geopolitics'); each tag's public timeline is pulled. */
  hashtags?: string[];
  /** Also pull the instance's public (federated) timeline. */
  includePublicTimeline?: boolean;
  /** Restrict the public timeline to the instance's own local posts (default: federated). */
  localOnly?: boolean;
  /** ISO 3166-1 alpha-2 codes; usually unset — the fediverse is a mixed-origin global commons. */
  originCountryCodes?: string[];
}

/**
 * The genai_open_api category spans multiple open-GenAI providers — the Hugging Face Hub
 * (the supply side: where models/datasets are built) and Civitai (the output side: actual
 * AI-generated images). Each source's config carries a `provider` discriminator so the
 * single category fetcher can fan out to the right adapter. An absent provider means
 * 'huggingface' — the original Hub-only sources predate this field.
 */
export type GenaiProvider = 'huggingface' | 'civitai';

export interface HuggingFaceSourceConfig {
  /** Open-GenAI provider discriminator; absent or 'huggingface' routes to the Hub adapter. */
  provider?: GenaiProvider;
  /** Hub repository type to list. Defaults to 'model'. */
  repoType?: 'model' | 'dataset';
  /** Sort order: 'trending' (default), 'downloads', 'likes', 'lastModified', 'createdAt'. */
  sort?: 'trending' | 'downloads' | 'likes' | 'lastModified' | 'createdAt';
  /** Optional Hub tag filter, e.g. 'text-generation', 'text-to-image', 'translation'. */
  filter?: string;
  /** Optional free-text search over repo ids. */
  search?: string;
  /** Max repos to pull per run (1–100; defaults to 50). */
  limit?: number;
  /** ISO 3166-1 alpha-2 codes; usually unset — the Hub is a mixed-origin global commons. */
  originCountryCodes?: string[];
}

export interface CivitaiSourceConfig {
  /** Selects the Civitai adapter; required to route here (Hugging Face is the default). */
  provider: 'civitai';
  /** Image ranking: 'Most Reactions' (default), 'Most Comments', or 'Newest'. */
  sort?: 'Most Reactions' | 'Most Comments' | 'Newest';
  /** Ranking window: 'AllTime' | 'Year' | 'Month' | 'Week' (default) | 'Day'. */
  period?: 'AllTime' | 'Year' | 'Month' | 'Week' | 'Day';
  /** Max images to pull per run (1–200; defaults to 100). */
  limit?: number;
  /**
   * Optional Civitai base-model filter (OR-combined; the param is repeated per value). Each
   * string is matched against the model an item was generated with; filtering to the on-site
   * video base models — ['Hunyuan Video', 'Wan Video', 'LTXV', 'CogVideoX', 'Mochi', 'Vidu Q1']
   * — turns the shared image+video feed into a near-pure AI-video stream (≈99% video observed).
   * The adapter still tags each item's media_type per row. Absent means no model filter.
   */
  baseModels?: string[];
  /** ISO 3166-1 alpha-2 codes; usually unset — Civitai is a mixed-origin global commons. */
  originCountryCodes?: string[];
}

/**
 * Vimeo (official REST API) — the curated/creator video platform, a counterpart to YouTube.
 * Token-gated (VIMEO_ACCESS_TOKEN, "public" scope). A source defines exactly one slice: an
 * open search (`query`), a channel, or a user feed. A known AI-creator channel can assert an
 * ai_mediation prior; open search is left unasserted (the gate/scorer classify per video,
 * since a search match does not prove AI origin).
 */
export interface VimeoSourceConfig {
  /** Free-text search over public videos (GET /videos?query=…). One of query/channel/user. */
  query?: string;
  /** Pull a specific channel's videos instead of search (GET /channels/{channel}/videos). */
  channel?: string;
  /** Pull a specific user's uploads instead of search (GET /users/{user}/videos). */
  user?: string;
  /** Sort order: 'relevant' (default), 'date', 'plays', 'likes'. */
  sort?: 'relevant' | 'date' | 'plays' | 'likes';
  /** Max videos per run (1–100; defaults to 50). */
  perPage?: number;
  /** ISO 3166-1 alpha-2 codes applied to every artifact from this source. */
  originCountryCodes?: string[];
  /** Authorship-origin prior (e.g. 'ai_assisted' for a known AI-creator channel). */
  aiMediation?: AiMediation;
}

/**
 * The cultural_institution category spans multiple open-access museum APIs — the high-
 * provenance, documented-human-heritage contrast to AI-generated content. Like genai_open_api,
 * each source config carries a `provider` discriminator so the single category fetcher fans out
 * to the right museum adapter; an absent provider means 'met'. Both providers are keyless and
 * CC0. Unlike every other category, origin is NOT a fixed per-source tag: each object's
 * originCountryCodes is derived per-object from the museum's own culture/country provenance,
 * because cataloguing documented origin is precisely what these institutions do.
 */
export type CulturalProvider = 'met' | 'cleveland';

/** The Metropolitan Museum of Art Collection API (keyless, CC0). Two-step: search → per-object. */
export interface MetSourceConfig {
  /** Museum discriminator; absent or 'met' routes to the Met adapter. */
  provider?: 'met';
  /** Search term; a culture adjective ('Chinese', 'Egyptian') yields the cleanest origin pool. */
  query: string;
  /** Optional Met departmentId filter (see GET /departments). */
  departmentId?: number;
  /** Restrict to curator-flagged highlights. */
  isHighlight?: boolean;
  /** Max objects to fetch per run (1–100; defaults to 60). Each object is a separate request. */
  limit?: number;
}

/** The Cleveland Museum of Art Open Access API (keyless, CC0). One-step: search returns objects. */
export interface ClevelandSourceConfig {
  /** Selects the Cleveland adapter; required to route here (Met is the default). */
  provider: 'cleveland';
  /** Search term; a culture/region word ('Japan', 'France') works well. */
  query: string;
  /** Max objects to pull per run (1–100; defaults to 80). Returned inline — no per-object fetch. */
  limit?: number;
}
