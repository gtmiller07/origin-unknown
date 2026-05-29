import type { AppBskyFeedDefs } from '@atproto/api';
import { describe, expect, it } from 'vitest';
import { normalizeAuthorFeed, normalizeBlueskyPost } from '../../lib/ingestion/bluesky';

type FeedViewPost = AppBskyFeedDefs.FeedViewPost;

const LONG_EN =
  'Governments announce new cultural exchange initiatives to strengthen diplomatic ties worldwide.';

const imageEmbed = {
  $type: 'app.bsky.embed.images#view',
  images: [
    {
      $type: 'app.bsky.embed.images#viewImage',
      thumb: 'https://cdn.bsky.app/img/thumb.jpg',
      fullsize: 'https://cdn.bsky.app/img/full.jpg',
      alt: 'a national flag',
    },
  ],
};

const repostReason = {
  $type: 'app.bsky.feed.defs#reasonRepost',
  by: { did: 'did:plc:other', handle: 'someone.bsky.social' },
  indexedAt: '2026-05-02T00:00:00.000Z',
};

function makeFeedPost(
  over: {
    uri?: string;
    handle?: string;
    did?: string;
    text?: string;
    createdAt?: string;
    indexedAt?: string;
    langs?: string[];
    embed?: unknown;
    reason?: unknown;
    recordHasType?: boolean;
  } = {}
): FeedViewPost {
  const did = over.did ?? 'did:plc:abc123';
  const record: Record<string, unknown> = {
    text: over.text ?? '',
    createdAt: over.createdAt ?? '2026-05-01T12:00:00.000Z',
  };
  if (over.recordHasType !== false) record.$type = 'app.bsky.feed.post';
  if (over.langs) record.langs = over.langs;

  return {
    post: {
      uri: over.uri ?? `at://${did}/app.bsky.feed.post/rkey001`,
      cid: 'bafyreigexample',
      author: { did, handle: over.handle ?? 'xinhua.bsky.social' },
      record,
      indexedAt: over.indexedAt ?? '2026-05-01T12:00:05.000Z',
      ...(over.embed ? { embed: over.embed } : {}),
    },
    ...(over.reason ? { reason: over.reason } : {}),
  } as unknown as FeedViewPost;
}

describe('normalizeBlueskyPost', () => {
  it('maps a text post: uri id, body in description, permalink, language', () => {
    const a = normalizeBlueskyPost(makeFeedPost({ text: LONG_EN }), {
      originCountryCodes: ['CN'],
    });
    expect(a).not.toBeNull();
    if (!a) return;
    expect(a.externalId).toBe('at://did:plc:abc123/app.bsky.feed.post/rkey001');
    expect(a.title).toBeNull();
    expect(a.description).toBe(LONG_EN);
    expect(a.contentUrl).toBe('https://bsky.app/profile/xinhua.bsky.social/post/rkey001');
    expect(a.mediaType).toBe('text');
    expect(a.languageCodes).toEqual(['eng']);
    expect(a.originCountryCodes).toEqual(['CN']);
    expect(a.publishedAt).toBe('2026-05-01T12:00:00.000Z');
    expect(a.isAiGenerated).toBeNull();
  });

  it('extracts the thumbnail and image media type from an image embed', () => {
    const a = normalizeBlueskyPost(makeFeedPost({ text: 'photo', embed: imageEmbed }));
    expect(a?.mediaType).toBe('image');
    expect(a?.thumbnailUrl).toBe('https://cdn.bsky.app/img/thumb.jpg');
  });

  it('skips reposts by default', () => {
    expect(normalizeBlueskyPost(makeFeedPost({ reason: repostReason }))).toBeNull();
  });

  it('keeps reposts when includeReposts is set', () => {
    const a = normalizeBlueskyPost(makeFeedPost({ text: LONG_EN, reason: repostReason }), {
      includeReposts: true,
    });
    expect(a).not.toBeNull();
  });

  it('returns null description for an empty post and detects no language', () => {
    const a = normalizeBlueskyPost(makeFeedPost({ text: '   ' }));
    expect(a?.description).toBeNull();
    expect(a?.languageCodes).toBeNull();
  });

  it('falls back to the DID in the permalink for an invalid handle', () => {
    const a = normalizeBlueskyPost(makeFeedPost({ handle: 'handle.invalid' }));
    expect(a?.contentUrl).toBe('https://bsky.app/profile/did:plc:abc123/post/rkey001');
  });

  it('falls back to indexedAt when the record is not a valid post record', () => {
    const a = normalizeBlueskyPost(
      makeFeedPost({ recordHasType: false, indexedAt: '2026-05-09T08:00:00.000Z' })
    );
    expect(a?.description).toBeNull();
    expect(a?.publishedAt).toBe('2026-05-09T08:00:00.000Z');
  });
});

describe('normalizeAuthorFeed', () => {
  it('normalizes authored posts and drops reposts', () => {
    const feed = [
      makeFeedPost({ uri: 'at://did:plc:abc123/app.bsky.feed.post/p1', text: LONG_EN }),
      makeFeedPost({ uri: 'at://did:plc:abc123/app.bsky.feed.post/p2', reason: repostReason }),
      makeFeedPost({ uri: 'at://did:plc:abc123/app.bsky.feed.post/p3', embed: imageEmbed }),
    ];
    const out = normalizeAuthorFeed(feed, { originCountryCodes: ['RU'] });
    expect(out).toHaveLength(2);
    expect(out.map((a) => a.externalId)).toEqual([
      'at://did:plc:abc123/app.bsky.feed.post/p1',
      'at://did:plc:abc123/app.bsky.feed.post/p3',
    ]);
    expect(out.every((a) => a.originCountryCodes?.[0] === 'RU')).toBe(true);
  });
});
