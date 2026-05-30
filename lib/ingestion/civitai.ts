/**
 * Civitai adapter for the `genai_open_api` category — the open REST API over fetch, no SDK.
 *
 * Civitai is the *output* side of generative AI: each artifact is an AI-generated image
 * (or video) plus the prompt, base model, and creator behind it. That makes it the most
 * literal "AI-mediated cultural artifact" in the corpus and the only adapter that sets
 * isAiGenerated = true — the defining member of the AI-origin contrast class against the
 * human/institutional sources.
 *
 * normalizeCivitaiImage / normalizeCivitaiImages are pure (a Civitai image row ->
 * NormalizedArtifact[]) and unit-tested offline. fetchCivitaiArtifacts wraps them with the
 * network: one list call returns the configured slice (e.g. the week's most-reacted safe
 * images), ranked first.
 *
 * Reads work anonymously from anywhere (like the Hugging Face Hub, unlike Reddit), so there
 * is no credential gate. An optional CIVITAI_API_KEY is attached when present, purely to
 * raise rate limits. NSFW is filtered twice: the request asks for safe-only (nsfw=None) and
 * the normalizer drops anything whose nsfwLevel is not 'None' as a backstop.
 *
 * The prompt is the cultural DNA: it rides in `description` (and a truncated form as title),
 * is run through language detection (a non-English prompt is a real cultural-origin signal),
 * and the full structured payload (model, stats, creator) rides in rawPayload.
 */
import type { Source } from '../db/schema';
import { detectLanguageCodes, parseDate } from './text';
import type { CivitaiSourceConfig, FetchResult, IngestError, NormalizedArtifact } from './types';

const API_URL = 'https://civitai.com/api/v1/images';
const USER_AGENT = 'origin-unknown/0.1 (+https://origin-unknown.vercel.app)';
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const FETCH_TIMEOUT_MS = 15_000;
/** Prompts double as titles; cap the title and keep the full text in description. */
const TITLE_MAX = 140;

const SORTS = new Set(['Most Reactions', 'Most Comments', 'Newest']);
const PERIODS = new Set(['AllTime', 'Year', 'Month', 'Week', 'Day']);

/** Reaction/engagement counts on an image row; all optional. */
export interface CivitaiImageStats {
  cryCount?: number;
  laughCount?: number;
  likeCount?: number;
  dislikeCount?: number;
  heartCount?: number;
  commentCount?: number;
}

/** Minimal shape of a Civitai image row; everything else rides in rawPayload. */
export interface CivitaiImage {
  id?: number;
  url?: string;
  width?: number;
  height?: number;
  type?: string;
  nsfw?: boolean;
  nsfwLevel?: string;
  createdAt?: string;
  postId?: number;
  username?: string;
  baseModel?: string;
  stats?: CivitaiImageStats;
  meta?: { prompt?: string; [key: string]: unknown } | null;
  [key: string]: unknown;
}

export interface CivitaiNormalizeOptions {
  originCountryCodes?: string[] | null;
}

/** Only fully-safe images pass: anything flagged nsfw or rated above 'None' is dropped. */
function isSafe(image: CivitaiImage): boolean {
  if (image.nsfw === true) return false;
  if (image.nsfwLevel != null && image.nsfwLevel !== 'None') return false;
  return true;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

export function normalizeCivitaiImage(
  image: CivitaiImage,
  opts: CivitaiNormalizeOptions = {}
): NormalizedArtifact | null {
  // The numeric image id is globally unique on Civitai and the stable (sourceId, externalId)
  // upsert key; without it there is nothing to anchor the artifact to.
  if (image.id == null) return null;
  // Safety backstop: the request already asks for nsfw=None, but never trust the upstream
  // filter — re-check here so a single normalizer call is self-contained and testable.
  if (!isSafe(image)) return null;

  const externalId = String(image.id);
  const prompt = typeof image.meta?.prompt === 'string' ? image.meta.prompt.trim() : '';
  // 'image' and 'video' are both in the media_type CHECK vocabulary; Civitai posts can be either.
  const mediaType = image.type === 'video' ? 'video' : 'image';

  return {
    externalId,
    // The prompt is the closest thing to a human-readable title; truncate it for the title
    // and keep the full text in description. Fall back to a synthetic label when there's none.
    title: prompt ? truncate(prompt, TITLE_MAX) : `Civitai image ${externalId}`,
    description: prompt || null,
    contentUrl: `https://civitai.com/images/${externalId}`,
    // `url` is the direct CDN render of the image itself — a natural thumbnail.
    thumbnailUrl: typeof image.url === 'string' ? image.url : null,
    mediaType,
    // Unlike repo slugs, prompts are natural language, so detection is meaningful here.
    languageCodes: detectLanguageCodes(prompt),
    originCountryCodes: opts.originCountryCodes ?? null,
    publishedAt: parseDate(image.createdAt),
    // The defining property of this source: every Civitai image is AI-generated output.
    isAiGenerated: true,
    rawPayload: image,
  };
}

export function normalizeCivitaiImages(
  images: CivitaiImage[],
  opts: CivitaiNormalizeOptions = {}
): NormalizedArtifact[] {
  const out: NormalizedArtifact[] = [];
  for (const image of images) {
    const normalized = normalizeCivitaiImage(image, opts);
    if (normalized) out.push(normalized);
  }
  return out;
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

interface CivitaiImagesResponse {
  items?: CivitaiImage[];
}

async function fetchImages(url: URL): Promise<CivitaiImage[]> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': USER_AGENT,
  };
  // The key only raises anonymous rate limits; reads work without it, so there is no
  // credential gate (unlike YouTube/Reddit, which return empty when their keys are absent).
  const key = process.env.CIVITAI_API_KEY;
  if (key) headers.authorization = `Bearer ${key}`;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as CivitaiImagesResponse;
  return Array.isArray(json.items) ? json.items : [];
}

export async function fetchCivitaiArtifacts(source: Source): Promise<FetchResult> {
  const config = (source.config ?? {}) as CivitaiSourceConfig;
  const items: NormalizedArtifact[] = [];
  const errors: IngestError[] = [];

  const sort = config.sort && SORTS.has(config.sort) ? config.sort : 'Most Reactions';
  const period = config.period && PERIODS.has(config.period) ? config.period : 'Week';

  const url = new URL(API_URL);
  url.searchParams.set('limit', String(clampLimit(config.limit)));
  url.searchParams.set('sort', sort);
  url.searchParams.set('period', period);
  // Safe-only at the source; the normalizer drops anything that slips through.
  url.searchParams.set('nsfw', 'None');

  try {
    const images = await fetchImages(url);
    items.push(
      ...normalizeCivitaiImages(images, { originCountryCodes: config.originCountryCodes })
    );
  } catch (err) {
    errors.push({
      feed: `images:${sort}:${period}`,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return { items, errors };
}
