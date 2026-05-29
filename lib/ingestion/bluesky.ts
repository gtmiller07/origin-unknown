/**
 * Bluesky (AT Protocol) adapter for the `bluesky` source category.
 *
 * normalizeBlueskyPost / normalizeAuthorFeed are pure (atproto view objects ->
 * NormalizedArtifact[]) and unit-tested offline. fetchBlueskyArtifacts wraps them
 * with the network: it pulls each configured actor's author feed via getAuthorFeed.
 *
 * Auth is optional and degrades gracefully: with BLUESKY_IDENTIFIER +
 * BLUESKY_APP_PASSWORD it logs in through bsky.social (higher rate limits);
 * without them it reads the public AppView (public.api.bsky.app) unauthenticated,
 * so the adapter works out of the box and picks up credentials the moment they land.
 */
import {
  AppBskyEmbedExternal,
  AppBskyEmbedImages,
  AppBskyEmbedRecordWithMedia,
  AppBskyEmbedVideo,
  AppBskyFeedDefs,
  AppBskyFeedPost,
  AtpAgent,
} from '@atproto/api';
import type { Source } from '../db/schema';
import { detectLanguageCodes, parseDate, toArray } from './text';
import type { BlueskySourceConfig, FetchResult, IngestError, NormalizedArtifact } from './types';

const PUBLIC_SERVICE = 'https://public.api.bsky.app';
const AUTH_SERVICE = 'https://bsky.social';
const PAGE_SIZE = 100;
/** Pages of PAGE_SIZE pulled per actor per run; the upsert dedups across runs. */
const MAX_PAGES = 2;
const FETCH_TIMEOUT_MS = 15_000;

export interface BlueskyNormalizeOptions {
  originCountryCodes?: string[] | null;
  includeReposts?: boolean;
}

/** Resolve the thumbnail + media type from a hydrated embed view, if any. */
function mediaView(view: unknown): { thumbnailUrl: string | null; mediaType: string } | null {
  if (AppBskyEmbedImages.isView(view)) {
    return { thumbnailUrl: view.images[0]?.thumb ?? null, mediaType: 'image' };
  }
  if (AppBskyEmbedVideo.isView(view)) {
    return {
      thumbnailUrl: typeof view.thumbnail === 'string' ? view.thumbnail : null,
      mediaType: 'video',
    };
  }
  if (AppBskyEmbedExternal.isView(view)) {
    return { thumbnailUrl: view.external?.thumb ?? null, mediaType: 'text' };
  }
  return null;
}

function mediaFromEmbed(embed: AppBskyFeedDefs.PostView['embed']): {
  thumbnailUrl: string | null;
  mediaType: string;
} {
  if (!embed) return { thumbnailUrl: null, mediaType: 'text' };
  const direct = mediaView(embed);
  if (direct) return direct;
  // A post can pair a quoted record with media; pull the thumbnail from the media half.
  if (AppBskyEmbedRecordWithMedia.isView(embed)) {
    const nested = mediaView(embed.media);
    if (nested) return nested;
  }
  return { thumbnailUrl: null, mediaType: 'text' };
}

/** Public bsky.app permalink; prefers the handle, falling back to the stable DID. */
function postPermalink(author: AppBskyFeedDefs.PostView['author'], uri: string): string | null {
  const rkey = uri.split('/').pop();
  if (!rkey) return null;
  const handle = author.handle && author.handle !== 'handle.invalid' ? author.handle : author.did;
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

export function normalizeBlueskyPost(
  item: AppBskyFeedDefs.FeedViewPost,
  opts: BlueskyNormalizeOptions = {}
): NormalizedArtifact | null {
  // getAuthorFeed surfaces the account's reposts of others; those aren't its
  // authored content (post.author is someone else), so drop them by default.
  if (!opts.includeReposts && AppBskyFeedDefs.isReasonRepost(item.reason)) return null;

  const post = item.post;
  const externalId = post.uri;
  if (!externalId) return null;

  const record = AppBskyFeedPost.isRecord(post.record) ? post.record : null;
  const text = (record?.text ?? '').trim();
  const { thumbnailUrl, mediaType } = mediaFromEmbed(post.embed);

  return {
    externalId,
    // Posts have no title; the body lives in description (embeds fine on its own).
    title: null,
    description: text.length ? text : null,
    contentUrl: postPermalink(post.author, externalId),
    thumbnailUrl,
    mediaType,
    // Detect from text for corpus-wide consistency with RSS; the author-declared
    // record.langs is preserved in rawPayload for later reconciliation.
    languageCodes: detectLanguageCodes(text),
    originCountryCodes: opts.originCountryCodes ?? null,
    publishedAt: parseDate(record?.createdAt) ?? parseDate(post.indexedAt),
    isAiGenerated: null,
    rawPayload: post,
  };
}

export function normalizeAuthorFeed(
  feed: AppBskyFeedDefs.FeedViewPost[],
  opts: BlueskyNormalizeOptions = {}
): NormalizedArtifact[] {
  const out: NormalizedArtifact[] = [];
  for (const item of feed) {
    const normalized = normalizeBlueskyPost(item, opts);
    if (normalized) out.push(normalized);
  }
  return out;
}

async function makeAgent(): Promise<AtpAgent> {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (identifier && password) {
    const agent = new AtpAgent({ service: AUTH_SERVICE });
    await agent.login({ identifier, password });
    return agent;
  }
  // No credentials: read the public AppView unauthenticated.
  return new AtpAgent({ service: PUBLIC_SERVICE });
}

async function fetchAuthorFeed(
  agent: AtpAgent,
  actor: string
): Promise<AppBskyFeedDefs.FeedViewPost[]> {
  const out: AppBskyFeedDefs.FeedViewPost[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await agent.app.bsky.feed.getAuthorFeed(
      { actor, limit: PAGE_SIZE, cursor, filter: 'posts_no_replies' },
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    );
    out.push(...res.data.feed);
    cursor = res.data.cursor;
    if (!cursor || res.data.feed.length === 0) break;
  }
  return out;
}

export async function fetchBlueskyArtifacts(source: Source): Promise<FetchResult> {
  const config = (source.config ?? {}) as BlueskySourceConfig;
  const actors = toArray(config.actors);
  const items: NormalizedArtifact[] = [];
  const errors: IngestError[] = [];
  if (!actors.length) return { items, errors };

  let agent: AtpAgent;
  try {
    agent = await makeAgent();
  } catch (err) {
    return {
      items,
      errors: [{ message: `auth: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }

  const normalizeOpts: BlueskyNormalizeOptions = {
    originCountryCodes: config.originCountryCodes,
    includeReposts: config.includeReposts,
  };
  for (const actor of actors) {
    try {
      const feed = await fetchAuthorFeed(agent, actor);
      items.push(...normalizeAuthorFeed(feed, normalizeOpts));
    } catch (err) {
      errors.push({ feed: actor, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { items, errors };
}
