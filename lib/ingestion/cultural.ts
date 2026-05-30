/**
 * Network fetchers + provider dispatcher for the cultural_institution category. Mirrors the
 * genai_open_api pattern: ingestCategory runs one fetcher across every source in the category,
 * so fetchCulturalArtifacts fans each source out to its museum adapter by reading the `provider`
 * discriminator on the source config. An absent provider means 'met'.
 *
 * The Met needs a two-step flow (search returns IDs, then one fetch per object); Cleveland
 * returns full objects inline in the search response. All pure normalization lives in
 * cultural-origin.ts. Both APIs are keyless and CC0.
 */
import type { Source } from '../db/schema';
import {
  type ClevelandObject,
  type MetObject,
  clamp,
  normalizeClevelandObject,
  normalizeMetObject,
} from './cultural-origin';
import type {
  ClevelandSourceConfig,
  CulturalProvider,
  FetchResult,
  IngestError,
  MetSourceConfig,
  NormalizedArtifact,
} from './types';

const USER_AGENT = 'origin-unknown/0.1 (+https://origin-unknown.vercel.app)';
const FETCH_TIMEOUT_MS = 15_000;

const MET_BASE = 'https://collectionapi.metmuseum.org/public/collection/v1';
const DEFAULT_MET_LIMIT = 60;
const MAX_MET_LIMIT = 100;
// The Met's edge (Cloudflare) returns 403 on concurrent bursts, and the block is cumulative across
// a run — confirmed empirically that ANY concurrency eventually trips it after enough requests,
// while fully serial traffic is 100% clean (well under the documented 80 req/s). So we fetch Met
// objects serially; getJson's retry/backoff covers the rare genuinely-transient blip.
const MET_OBJECT_CONCURRENCY = 1;

// Transient HTTP statuses worth retrying: the Met's burst-403, classic rate-limit, and 5xx.
const RETRYABLE_STATUS = new Set([403, 408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

const CMA_BASE = 'https://openaccess-api.clevelandart.org/api';
const DEFAULT_CMA_LIMIT = 80;
const MAX_CMA_LIMIT = 100;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with jitter for retry attempt 2 (~450ms) and 3 (~1350ms). */
function backoffMs(attempt: number): number {
  return 150 * 3 ** (attempt - 1) + Math.floor(Math.random() * 150);
}

/**
 * GET JSON with bounded retry. Network/timeout errors and transient HTTP statuses (the Met's
 * burst-403, 429, 5xx) are retried with backoff; a permanent status (e.g. 404) fails immediately.
 */
async function getJson<T>(url: string): Promise<T> {
  let lastErr: unknown = new Error(`request never attempted: ${url}`);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await sleep(backoffMs(attempt));
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      lastErr = err; // network / timeout — retryable
      continue;
    }
    if (res.ok) return (await res.json()) as T;
    lastErr = new Error(`HTTP ${res.status} for ${url}`);
    if (!RETRYABLE_STATUS.has(res.status)) throw lastErr; // permanent — stop now
  }
  throw lastErr;
}

/** Run `fn` over `items` with at most `concurrency` in flight. */
async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await fn(current);
    }
  });
  await Promise.all(workers);
}

export async function fetchMetArtifacts(source: Source): Promise<FetchResult> {
  const config = (source.config ?? {}) as MetSourceConfig;
  const query = config.query?.trim();
  if (!query) return { items: [], errors: [{ message: 'met source config has no query' }] };
  const limit = clamp(config.limit ?? DEFAULT_MET_LIMIT, 1, MAX_MET_LIMIT);

  const searchUrl = new URL(`${MET_BASE}/search`);
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('hasImages', 'true');
  if (config.departmentId != null) {
    searchUrl.searchParams.set('departmentId', String(config.departmentId));
  }
  if (config.isHighlight) searchUrl.searchParams.set('isHighlight', 'true');

  let ids: number[];
  try {
    const data = await getJson<{ total: number; objectIDs: number[] | null }>(searchUrl.toString());
    ids = (data.objectIDs ?? []).slice(0, limit);
  } catch (err) {
    return { items: [], errors: [{ feed: query, message: errMessage(err) }] };
  }

  const items: NormalizedArtifact[] = [];
  const errors: IngestError[] = [];
  await mapWithConcurrency(ids, MET_OBJECT_CONCURRENCY, async (id) => {
    try {
      const obj = await getJson<MetObject>(`${MET_BASE}/objects/${id}`);
      const normalized = normalizeMetObject(obj);
      if (normalized) items.push(normalized);
    } catch (err) {
      errors.push({ feed: `object ${id}`, message: errMessage(err) });
    }
  });

  return { items, errors };
}

export async function fetchClevelandArtifacts(source: Source): Promise<FetchResult> {
  const config = (source.config ?? {}) as ClevelandSourceConfig;
  const query = config.query?.trim();
  if (!query) return { items: [], errors: [{ message: 'cleveland source config has no query' }] };
  const limit = clamp(config.limit ?? DEFAULT_CMA_LIMIT, 1, MAX_CMA_LIMIT);

  const url = new URL(`${CMA_BASE}/artworks/`);
  url.searchParams.set('q', query);
  url.searchParams.set('has_image', '1');
  url.searchParams.set('cc0', '1');
  url.searchParams.set('limit', String(limit));

  try {
    const data = await getJson<{ data: ClevelandObject[] | null }>(url.toString());
    const items: NormalizedArtifact[] = [];
    for (const obj of data.data ?? []) {
      const normalized = normalizeClevelandObject(obj);
      if (normalized) items.push(normalized);
    }
    return { items, errors: [] };
  } catch (err) {
    return { items: [], errors: [{ feed: query, message: errMessage(err) }] };
  }
}

export async function fetchCulturalArtifacts(source: Source): Promise<FetchResult> {
  const provider = ((source.config ?? {}) as { provider?: CulturalProvider }).provider;
  switch (provider) {
    case 'cleveland':
      return fetchClevelandArtifacts(source);
    default:
      // 'met' or absent.
      return fetchMetArtifacts(source);
  }
}
