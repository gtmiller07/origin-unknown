/**
 * Mastodon (Fediverse / ActivityPub) adapter — the open, ungated grassroots social-discourse
 * source. One source reads one instance's PUBLIC timelines anonymously over fetch (no SDK, no
 * OAuth): each configured hashtag timeline (/api/v1/timelines/tag/:tag) for topical discourse
 * and, optionally, the federated public timeline (/api/v1/timelines/public). Public reads need
 * no credentials, so unlike Reddit there is no API gate and no degraded-without-keys path — it
 * works out of the box. (An instance that has locked down unauthenticated API access simply
 * returns an error, which is recorded per-feed and skipped.)
 *
 * normalizeMastodonStatus / normalizeMastodonStatuses are pure (a Mastodon Status object ->
 * NormalizedArtifact[]) and unit-tested offline. fetchMastodonArtifacts wraps them with the
 * network, paging each hashtag (and the public timeline) via max_id.
 *
 * A status is a microblog post: no title (like Bluesky), its HTML body stripped to text in
 * description, and media attachments mapped to a thumbnail + media type — the only adapter that
 * emits 'mixed', when a post carries attachments of more than one kind. Boosts (reblogs) are
 * dropped: a boost is not original discourse from this timeline. Each status carries an
 * author-declared `language` (ISO 639-1), but for corpus-wide consistency with RSS/Bluesky we
 * detect language from the post text and keep the declared value in rawPayload.
 */
import type { Source } from '../db/schema';
import { detectLanguageCodes, parseDate, stripHtml, toArray } from './text';
import type { FetchResult, IngestError, MastodonSourceConfig, NormalizedArtifact } from './types';

// Mastodon asks clients to send a descriptive UA; a generic one gets throttled harder.
const USER_AGENT = 'origin-unknown/0.1 (+https://origin-unknown.vercel.app)';
/** Mastodon caps a timeline `limit` at 40. */
const PAGE_SIZE = 40;
/** Pages of PAGE_SIZE pulled per timeline per run; the upsert dedups across runs. */
const MAX_PAGES = 2;
const FETCH_TIMEOUT_MS = 15_000;

/** A media attachment on a status; everything else rides in rawPayload. */
export interface MastodonMediaAttachment {
  type?: string;
  url?: string;
  preview_url?: string;
  description?: string | null;
  [key: string]: unknown;
}

/** Minimal shape of a Mastodon Status; everything else rides in rawPayload. */
export interface MastodonStatus {
  id?: string;
  uri?: string;
  url?: string | null;
  content?: string;
  created_at?: string;
  language?: string | null;
  sensitive?: boolean;
  spoiler_text?: string;
  visibility?: string;
  media_attachments?: MastodonMediaAttachment[];
  reblog?: MastodonStatus | null;
  [key: string]: unknown;
}

export interface MastodonNormalizeOptions {
  originCountryCodes?: string[] | null;
}

/** Map a Mastodon attachment type onto the artifacts.media_type vocabulary. */
function mapAttachmentType(type: string | undefined): string {
  switch (type) {
    case 'image':
      return 'image';
    case 'video':
    case 'gifv':
      return 'video';
    case 'audio':
      return 'audio';
    default:
      return 'text';
  }
}

/** 'text' with no attachments, the single kind when uniform, else 'mixed'. */
function mediaTypeFor(attachments: MastodonMediaAttachment[]): string {
  if (!attachments.length) return 'text';
  const mapped = attachments.map((a) => mapAttachmentType(a.type));
  if (new Set(mapped).size > 1) return 'mixed';
  return mapped[0] ?? 'text';
}

/** First attachment with a usable image URL (preview preferred). */
function thumbnailFor(attachments: MastodonMediaAttachment[]): string | null {
  for (const a of attachments) {
    const url = a.preview_url || a.url;
    if (typeof url === 'string' && url.startsWith('http')) return url;
  }
  return null;
}

export function normalizeMastodonStatus(
  status: MastodonStatus,
  opts: MastodonNormalizeOptions = {}
): NormalizedArtifact | null {
  // A boost (reblog) re-surfaces someone else's post; it is not original discourse from this
  // timeline, so drop it (mirrors dropping Bluesky reposts).
  if (status.reblog) return null;

  // `uri` is the canonical ActivityPub object id (stable across federation); fall back to the
  // human-facing url, then the instance-local id. Without any there is nothing to key on.
  const externalId = status.uri ?? status.url ?? status.id;
  if (!externalId) return null;

  const text = stripHtml(status.content);
  const attachments = toArray(status.media_attachments);

  return {
    externalId,
    // Microblog statuses have no title (like Bluesky); the body carries the content.
    title: null,
    description: text,
    contentUrl: typeof status.url === 'string' ? status.url : (status.uri ?? null),
    thumbnailUrl: thumbnailFor(attachments),
    mediaType: mediaTypeFor(attachments),
    // Detect from text for corpus-wide consistency with RSS/Bluesky; the author-declared
    // `language` (ISO 639-1) is preserved in rawPayload for later reconciliation.
    languageCodes: detectLanguageCodes(text),
    originCountryCodes: opts.originCountryCodes ?? null,
    publishedAt: parseDate(status.created_at),
    isAiGenerated: null,
    rawPayload: status,
  };
}

export function normalizeMastodonStatuses(
  statuses: MastodonStatus[],
  opts: MastodonNormalizeOptions = {}
): NormalizedArtifact[] {
  const out: NormalizedArtifact[] = [];
  for (const status of statuses) {
    const normalized = normalizeMastodonStatus(status, opts);
    if (normalized) out.push(normalized);
  }
  return out;
}

/** Strip scheme and trailing slash so config accepts 'mastodon.social' or a full URL. */
function normalizeInstanceHost(instance: string): string {
  return instance
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

async function fetchTimeline(
  host: string,
  path: string,
  params: Record<string, string>
): Promise<MastodonStatus[]> {
  const out: MastodonStatus[] = [];
  let maxId: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`https://${host}${path}`);
    url.searchParams.set('limit', String(PAGE_SIZE));
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (maxId) url.searchParams.set('max_id', maxId);

    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const batch = (await res.json()) as MastodonStatus[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    // Statuses come newest-first; page older via the smallest id seen.
    const lastId = batch[batch.length - 1]?.id;
    if (!lastId) break;
    maxId = lastId;
    if (batch.length < PAGE_SIZE) break;
  }
  return out;
}

export async function fetchMastodonArtifacts(source: Source): Promise<FetchResult> {
  const config = (source.config ?? {}) as MastodonSourceConfig;
  const items: NormalizedArtifact[] = [];
  const errors: IngestError[] = [];

  const host = config.instance ? normalizeInstanceHost(config.instance) : '';
  if (!host) return { items, errors };

  const normalizeOpts: MastodonNormalizeOptions = { originCountryCodes: config.originCountryCodes };

  for (const tag of toArray(config.hashtags)) {
    try {
      const statuses = await fetchTimeline(
        host,
        `/api/v1/timelines/tag/${encodeURIComponent(tag)}`,
        {}
      );
      items.push(...normalizeMastodonStatuses(statuses, normalizeOpts));
    } catch (err) {
      errors.push({ feed: `#${tag}`, message: err instanceof Error ? err.message : String(err) });
    }
  }

  if (config.includePublicTimeline) {
    try {
      const statuses = await fetchTimeline(
        host,
        '/api/v1/timelines/public',
        config.localOnly ? { local: 'true' } : {}
      );
      items.push(...normalizeMastodonStatuses(statuses, normalizeOpts));
    } catch (err) {
      errors.push({ feed: 'public', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { items, errors };
}
