/**
 * YouTube Data API v3 adapter for the `youtube_api` source category.
 *
 * normalizeYoutubeVideo / normalizeYoutubeVideos are pure (youtube_v3.Schema$Video
 * -> NormalizedArtifact[]) and unit-tested offline. fetchYoutubeArtifacts wraps them
 * with the network: for each configured channel it resolves the uploads playlist,
 * pages the recent uploads, then batch-hydrates those videos.
 *
 * Auth is an API key (YOUTUBE_API_KEY), which is all public reads need. Without it
 * the adapter degrades gracefully — it warns once and returns an empty result — so
 * the rest of the pipeline ships and picks the key up the moment it lands, mirroring
 * the optional-auth pattern in the Bluesky adapter and lib/ratelimit.ts.
 *
 * Quota-efficient call shape (avoids the 100-unit search.list): channels.list
 * (1 unit, <=50 ids) -> playlistItems.list (1 unit/page) -> videos.list (1 unit, <=50 ids).
 */
import { google, type youtube_v3 } from 'googleapis';
import type { Source } from '../db/schema';
import { detectLanguageCodes, parseDate, toArray } from './text';
import type { FetchResult, IngestError, NormalizedArtifact, YoutubeSourceConfig } from './types';

/** playlistItems/videos cap at 50 results per call; we batch video ids to match. */
const PAGE_SIZE = 50;
const VIDEO_BATCH = 50;
/** Pages of PAGE_SIZE pulled per channel per run; the upsert dedups across runs. */
const MAX_PAGES_PER_CHANNEL = 2;
const FETCH_TIMEOUT_MS = 15_000;

export interface YoutubeNormalizeOptions {
  originCountryCodes?: string[] | null;
}

let warnedNoKey = false;

/** Highest-resolution thumbnail the API returned, walking down the quality ladder. */
function bestThumbnail(thumbs: youtube_v3.Schema$ThumbnailDetails | undefined): string | null {
  if (!thumbs) return null;
  return (
    thumbs.maxres?.url ??
    thumbs.standard?.url ??
    thumbs.high?.url ??
    thumbs.medium?.url ??
    thumbs.default?.url ??
    null
  );
}

export function normalizeYoutubeVideo(
  video: youtube_v3.Schema$Video,
  opts: YoutubeNormalizeOptions = {}
): NormalizedArtifact | null {
  const externalId = video.id;
  if (!externalId) return null;

  const snippet = video.snippet ?? {};
  const title = snippet.title ?? null;
  const description = snippet.description ?? null;

  return {
    externalId,
    title,
    description,
    contentUrl: `https://www.youtube.com/watch?v=${externalId}`,
    thumbnailUrl: bestThumbnail(snippet.thumbnails),
    mediaType: 'video',
    // Detect from title+description for corpus-wide consistency with the other
    // adapters; snippet.defaultAudioLanguage/defaultLanguage stay in rawPayload.
    languageCodes: detectLanguageCodes(`${title ?? ''} ${description ?? ''}`),
    originCountryCodes: opts.originCountryCodes ?? null,
    publishedAt: parseDate(snippet.publishedAt),
    isAiGenerated: null,
    rawPayload: video,
  };
}

export function normalizeYoutubeVideos(
  videos: youtube_v3.Schema$Video[],
  opts: YoutubeNormalizeOptions = {}
): NormalizedArtifact[] {
  const out: NormalizedArtifact[] = [];
  for (const video of videos) {
    const normalized = normalizeYoutubeVideo(video, opts);
    if (normalized) out.push(normalized);
  }
  return out;
}

/** API-key client for public reads, or null (warn once) when the key is absent. */
function getClient(): youtube_v3.Youtube | null {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    if (!warnedNoKey) {
      console.warn('[youtube] YOUTUBE_API_KEY not set; skipping YouTube ingestion.');
      warnedNoKey = true;
    }
    return null;
  }
  return google.youtube({ version: 'v3', auth: key });
}

/** channelId -> uploads playlist id (the playlist holding every public upload). */
async function uploadsPlaylists(
  yt: youtube_v3.Youtube,
  channelIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < channelIds.length; i += PAGE_SIZE) {
    const batch = channelIds.slice(i, i + PAGE_SIZE);
    const res = await yt.channels.list(
      { part: ['contentDetails'], id: batch, maxResults: PAGE_SIZE },
      { timeout: FETCH_TIMEOUT_MS }
    );
    for (const channel of res.data.items ?? []) {
      const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
      if (channel.id && uploads) out.set(channel.id, uploads);
    }
  }
  return out;
}

/** Recent video ids from an uploads playlist, newest first, capped at MAX_PAGES_PER_CHANNEL. */
async function playlistVideoIds(yt: youtube_v3.Youtube, playlistId: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES_PER_CHANNEL; page++) {
    const res = await yt.playlistItems.list(
      { part: ['contentDetails'], playlistId, maxResults: PAGE_SIZE, pageToken },
      { timeout: FETCH_TIMEOUT_MS }
    );
    for (const item of res.data.items ?? []) {
      const videoId = item.contentDetails?.videoId;
      if (videoId) ids.push(videoId);
    }
    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }
  return ids;
}

/** Hydrate video ids into full resources, batching <=50 per videos.list call. */
async function fetchVideos(
  yt: youtube_v3.Youtube,
  ids: string[]
): Promise<youtube_v3.Schema$Video[]> {
  const out: youtube_v3.Schema$Video[] = [];
  for (let i = 0; i < ids.length; i += VIDEO_BATCH) {
    const batch = ids.slice(i, i + VIDEO_BATCH);
    const res = await yt.videos.list(
      { part: ['snippet', 'contentDetails', 'statistics'], id: batch, maxResults: VIDEO_BATCH },
      { timeout: FETCH_TIMEOUT_MS }
    );
    out.push(...(res.data.items ?? []));
  }
  return out;
}

export async function fetchYoutubeArtifacts(source: Source): Promise<FetchResult> {
  const config = (source.config ?? {}) as YoutubeSourceConfig;
  const channelIds = toArray(config.channelIds);
  const items: NormalizedArtifact[] = [];
  const errors: IngestError[] = [];
  if (!channelIds.length) return { items, errors };

  const yt = getClient();
  if (!yt) return { items, errors };

  const normalizeOpts: YoutubeNormalizeOptions = {
    originCountryCodes: config.originCountryCodes,
  };

  // One channels.list resolves every channel's uploads playlist; a failure here is
  // fatal for the whole source (no playlists to walk), so surface it and bail.
  let playlists: Map<string, string>;
  try {
    playlists = await uploadsPlaylists(yt, channelIds);
  } catch (err) {
    return {
      items,
      errors: [{ message: `channels.list: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }

  for (const channelId of channelIds) {
    const playlistId = playlists.get(channelId);
    if (!playlistId) {
      errors.push({ feed: channelId, message: 'channel not found or no uploads playlist' });
      continue;
    }
    try {
      const ids = await playlistVideoIds(yt, playlistId);
      const videos = await fetchVideos(yt, ids);
      items.push(...normalizeYoutubeVideos(videos, normalizeOpts));
    } catch (err) {
      errors.push({ feed: channelId, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { items, errors };
}
