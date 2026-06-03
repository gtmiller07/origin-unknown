/**
 * Vimeo adapter for the `vimeo` source category — the official REST API over fetch, no SDK.
 *
 * Vimeo is the curated/creator video platform — a counterpart to the broadcaster-heavy
 * YouTube set, and a likely home for AI-generated short films and festival entries.
 * normalizeVimeoVideo / normalizeVimeoVideos are pure (a Vimeo video object ->
 * NormalizedArtifact[]) and unit-testable offline; fetchVimeoArtifacts wraps them with the
 * network: one list call returns the configured slice (a search query, or a channel/user feed).
 *
 * Auth is a Bearer access token (VIMEO_ACCESS_TOKEN, "public" scope). Like the Reddit and
 * YouTube adapters it degrades gracefully: without the token it warns once and returns an
 * empty result, so the pipeline ships and lights up the moment the credential lands. Only
 * public videos pass (privacy.view === 'anybody'), with a content-rating backstop dropping
 * explicit material — the same safe-only posture as the Civitai adapter.
 */
import type { Source } from '../db/schema';
import { detectLanguageCodes, parseDate, stripHtml } from './text';
import type { FetchResult, IngestError, NormalizedArtifact, VimeoSourceConfig } from './types';

const API_BASE = 'https://api.vimeo.com';
const USER_AGENT = 'origin-unknown/0.1 (+https://origin-unknown.vercel.app)';
// Pin the API version so the response shape can't shift under us.
const ACCEPT = 'application/vnd.vimeo.*+json;version=3.4';
const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 100;
const SORTS = new Set(['relevant', 'date', 'plays', 'likes']);
// Request only the fields we map, to keep the payload and rate-limit cost small.
const FIELDS = [
  'uri',
  'name',
  'description',
  'link',
  'duration',
  'created_time',
  'release_time',
  'privacy.view',
  'content_rating',
  'pictures.sizes',
  'user.name',
  'user.link',
].join(',');
// content_rating values that disqualify a video from this safe-only research corpus.
const BLOCKED_RATINGS = new Set(['nudity', 'drugs', 'violence']);

interface VimeoPicture {
  width?: number;
  link?: string;
}

/** Minimal shape of a Vimeo video object; everything else rides in rawPayload. */
export interface VimeoVideo {
  uri?: string;
  name?: string;
  description?: string | null;
  link?: string;
  duration?: number;
  created_time?: string;
  release_time?: string;
  privacy?: { view?: string };
  content_rating?: string[];
  pictures?: { sizes?: VimeoPicture[] };
  user?: { name?: string; link?: string };
  [key: string]: unknown;
}

interface VimeoListResponse {
  data?: VimeoVideo[];
}

export interface VimeoNormalizeOptions {
  originCountryCodes?: string[] | null;
}

/** "/videos/12345678" -> "12345678" (the stable externalId); null if absent/malformed. */
function videoId(uri: string | undefined): string | null {
  if (typeof uri !== 'string') return null;
  const m = uri.match(/\/videos\/(\d+)/);
  return m ? m[1] : null;
}

/** Largest available preview image as the thumbnail. */
function bestThumbnail(video: VimeoVideo): string | null {
  const sizes = video.pictures?.sizes;
  if (!Array.isArray(sizes) || sizes.length === 0) return null;
  let best: VimeoPicture | null = null;
  for (const size of sizes) {
    if (typeof size?.link !== 'string') continue;
    if (!best || (size.width ?? 0) > (best.width ?? 0)) best = size;
  }
  return best && typeof best.link === 'string' ? best.link : null;
}

/** Public + safe only: drop non-public videos and anything content-rated explicit. */
function isPublicSafe(video: VimeoVideo): boolean {
  if (video.privacy?.view && video.privacy.view !== 'anybody') return false;
  if (Array.isArray(video.content_rating)) {
    for (const rating of video.content_rating) {
      if (typeof rating === 'string' && BLOCKED_RATINGS.has(rating.toLowerCase())) return false;
    }
  }
  return true;
}

export function normalizeVimeoVideo(
  video: VimeoVideo,
  opts: VimeoNormalizeOptions = {}
): NormalizedArtifact | null {
  const externalId = videoId(video.uri);
  if (!externalId) return null;
  if (!isPublicSafe(video)) return null;

  const title = typeof video.name === 'string' ? video.name : null;
  const description = stripHtml(typeof video.description === 'string' ? video.description : null);

  return {
    externalId,
    title,
    description,
    contentUrl: typeof video.link === 'string' ? video.link : `https://vimeo.com/${externalId}`,
    thumbnailUrl: bestThumbnail(video),
    mediaType: 'video',
    languageCodes: detectLanguageCodes(`${title ?? ''} ${description ?? ''}`),
    originCountryCodes: opts.originCountryCodes ?? null,
    publishedAt: parseDate(video.created_time ?? video.release_time),
    isAiGenerated: null,
    rawPayload: video,
  };
}

export function normalizeVimeoVideos(
  videos: VimeoVideo[],
  opts: VimeoNormalizeOptions = {}
): NormalizedArtifact[] {
  const out: NormalizedArtifact[] = [];
  for (const video of videos) {
    const normalized = normalizeVimeoVideo(video, opts);
    if (normalized) out.push(normalized);
  }
  return out;
}

function clampPerPage(perPage: number | undefined): number {
  if (typeof perPage !== 'number' || !Number.isFinite(perPage)) return DEFAULT_PER_PAGE;
  return Math.max(1, Math.min(MAX_PER_PAGE, Math.floor(perPage)));
}

let warnedNoToken = false;
function getToken(): string | null {
  const token = process.env.VIMEO_ACCESS_TOKEN;
  if (!token) {
    if (!warnedNoToken) {
      console.warn('[vimeo] VIMEO_ACCESS_TOKEN not set; skipping Vimeo ingestion.');
      warnedNoToken = true;
    }
    return null;
  }
  return token;
}

/** Build the list endpoint for the configured slice: a search, a channel, or a user feed. */
function buildUrl(config: VimeoSourceConfig): URL {
  const perPage = String(clampPerPage(config.perPage));
  const sort = config.sort && SORTS.has(config.sort) ? config.sort : 'relevant';

  let url: URL;
  if (config.channel) {
    url = new URL(`${API_BASE}/channels/${encodeURIComponent(config.channel)}/videos`);
  } else if (config.user) {
    url = new URL(`${API_BASE}/users/${encodeURIComponent(config.user)}/videos`);
  } else {
    url = new URL(`${API_BASE}/videos`);
    url.searchParams.set('query', config.query ?? '');
  }
  url.searchParams.set('per_page', perPage);
  url.searchParams.set('sort', sort);
  url.searchParams.set('direction', 'desc');
  url.searchParams.set('fields', FIELDS);
  return url;
}

async function fetchVideos(url: URL, token: string): Promise<VimeoVideo[]> {
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: ACCEPT,
      'user-agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as VimeoListResponse;
  return Array.isArray(json.data) ? json.data : [];
}

export async function fetchVimeoArtifacts(source: Source): Promise<FetchResult> {
  const config = (source.config ?? {}) as VimeoSourceConfig;
  const items: NormalizedArtifact[] = [];
  const errors: IngestError[] = [];

  // A source must define exactly one slice; an empty config would search everything.
  if (!config.query && !config.channel && !config.user) {
    return { items, errors: [{ message: 'vimeo source has no query/channel/user configured' }] };
  }

  const token = getToken();
  if (!token) return { items, errors };

  const url = buildUrl(config);
  try {
    const videos = await fetchVideos(url, token);
    items.push(...normalizeVimeoVideos(videos, { originCountryCodes: config.originCountryCodes }));
  } catch (err) {
    errors.push({
      feed: config.channel ?? config.user ?? `query:${config.query}`,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return { items, errors };
}
