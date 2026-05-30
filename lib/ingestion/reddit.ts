/**
 * Reddit adapter for the `reddit` source category — direct API over fetch, no SDK.
 *
 * normalizeRedditPost / normalizeRedditPosts are pure (a Reddit "t3" link object ->
 * NormalizedArtifact[]) and unit-tested offline. fetchRedditArtifacts wraps them with
 * the network: it mints an app-only OAuth token, then pages each subreddit's listing.
 *
 * Auth is OAuth2 client-credentials ("application-only"), which is what reliable
 * server-side reads need — Reddit aggressively blocks unauthenticated requests from
 * datacenter IPs, so there is no public-fallback path here (unlike Bluesky's AppView).
 * Without REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET the adapter degrades gracefully:
 * it warns once and returns an empty result, so the pipeline ships and picks the
 * credentials up the moment they land — same pattern as the YouTube adapter.
 */
import type { Source } from '../db/schema';
import { detectLanguageCodes, toArray } from './text';
import type { FetchResult, IngestError, NormalizedArtifact, RedditSourceConfig } from './types';

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const API_BASE = 'https://oauth.reddit.com';
// Reddit asks for a unique, descriptive UA; a generic one gets rate-limited harder.
const USER_AGENT = 'origin-unknown/0.1 (+https://origin-unknown.vercel.app)';
const PAGE_SIZE = 100;
/** Pages of PAGE_SIZE pulled per subreddit per run; the upsert dedups across runs. */
const MAX_PAGES = 2;
const FETCH_TIMEOUT_MS = 15_000;
const LISTINGS = new Set(['new', 'hot', 'top']);

/** Minimal shape of a Reddit "t3" (link) object; everything else rides in rawPayload. */
export interface RedditPostData {
  name?: string;
  id?: string;
  title?: string;
  selftext?: string;
  permalink?: string;
  url?: string;
  thumbnail?: string;
  created_utc?: number;
  is_video?: boolean;
  post_hint?: string;
  preview?: { images?: Array<{ source?: { url?: string } }> };
  [key: string]: unknown;
}

interface RedditListing {
  data?: { after?: string | null; children?: Array<{ kind?: string; data?: RedditPostData }> };
}

export interface RedditNormalizeOptions {
  originCountryCodes?: string[] | null;
}

function epochToIso(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function redditMediaType(post: RedditPostData): string {
  if (post.is_video) return 'video';
  if (post.post_hint === 'hosted:video' || post.post_hint === 'rich:video') return 'video';
  if (post.post_hint === 'image') return 'image';
  return 'text';
}

/** Prefer the full-size preview image; fall back to the small thumbnail when it's a URL. */
function redditThumbnail(post: RedditPostData): string | null {
  const preview = post.preview?.images?.[0]?.source?.url;
  if (typeof preview === 'string' && preview.startsWith('http')) return preview;
  const thumb = post.thumbnail;
  if (typeof thumb === 'string' && thumb.startsWith('http')) return thumb;
  return null;
}

export function normalizeRedditPost(
  post: RedditPostData,
  opts: RedditNormalizeOptions = {}
): NormalizedArtifact | null {
  // "name" is the global fullname (t3_xxx); fall back to the base36 id.
  const externalId = post.name ?? post.id;
  if (!externalId) return null;

  const title = post.title ?? null;
  const selftext = (post.selftext ?? '').trim();

  return {
    externalId,
    title,
    description: selftext.length ? selftext : null,
    // The Reddit discussion permalink is the stable artifact URL; url is the off-site
    // destination for link posts, used only when a permalink is somehow absent.
    contentUrl: post.permalink ? `https://www.reddit.com${post.permalink}` : (post.url ?? null),
    thumbnailUrl: redditThumbnail(post),
    mediaType: redditMediaType(post),
    languageCodes: detectLanguageCodes(`${title ?? ''} ${selftext}`),
    originCountryCodes: opts.originCountryCodes ?? null,
    publishedAt: epochToIso(post.created_utc),
    isAiGenerated: null,
    rawPayload: post,
  };
}

export function normalizeRedditPosts(
  posts: RedditPostData[],
  opts: RedditNormalizeOptions = {}
): NormalizedArtifact[] {
  const out: NormalizedArtifact[] = [];
  for (const post of posts) {
    const normalized = normalizeRedditPost(post, opts);
    if (normalized) out.push(normalized);
  }
  return out;
}

let warnedNoCreds = false;

/** Mint an app-only bearer token, or return null (warn once) when creds are absent. */
async function getAccessToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) {
    if (!warnedNoCreds) {
      console.warn(
        '[reddit] REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET not set; skipping Reddit ingestion.'
      );
      warnedNoCreds = true;
    }
    return null;
  }

  const auth = Buffer.from(`${id}:${secret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': USER_AGENT,
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`token HTTP ${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('token response missing access_token');
  return json.access_token;
}

async function fetchSubredditListing(
  token: string,
  subreddit: string,
  listing: string
): Promise<RedditPostData[]> {
  const out: RedditPostData[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${API_BASE}/r/${encodeURIComponent(subreddit)}/${listing}`);
    url.searchParams.set('limit', String(PAGE_SIZE));
    // raw_json=1 stops Reddit HTML-escaping &, <, > in text and preview URLs.
    url.searchParams.set('raw_json', '1');
    if (after) url.searchParams.set('after', after);

    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as RedditListing;
    const children = json.data?.children ?? [];
    for (const child of children) {
      if (child?.kind === 't3' && child.data) out.push(child.data);
    }
    after = json.data?.after ?? undefined;
    if (!after || children.length === 0) break;
  }
  return out;
}

export async function fetchRedditArtifacts(source: Source): Promise<FetchResult> {
  const config = (source.config ?? {}) as RedditSourceConfig;
  const subreddits = toArray(config.subreddits);
  const items: NormalizedArtifact[] = [];
  const errors: IngestError[] = [];
  if (!subreddits.length) return { items, errors };

  let token: string | null;
  try {
    token = await getAccessToken();
  } catch (err) {
    return {
      items,
      errors: [{ message: `auth: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }
  if (!token) return { items, errors };

  const listing = LISTINGS.has(config.listing ?? '') ? (config.listing as string) : 'new';
  const normalizeOpts: RedditNormalizeOptions = { originCountryCodes: config.originCountryCodes };
  for (const subreddit of subreddits) {
    try {
      const posts = await fetchSubredditListing(token, subreddit, listing);
      items.push(...normalizeRedditPosts(posts, normalizeOpts));
    } catch (err) {
      errors.push({ feed: subreddit, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { items, errors };
}
