import { describe, expect, it } from 'vitest';
import {
  type RedditPostData,
  normalizeRedditPost,
  normalizeRedditPosts,
} from '../../lib/ingestion/reddit';

const LONG_EN =
  'Governments announce new cultural exchange initiatives to strengthen diplomatic ties worldwide.';

function makeRedditPost(over: Partial<RedditPostData> = {}): RedditPostData {
  return {
    name: 't3_abc123',
    id: 'abc123',
    title: 'A post title',
    selftext: '',
    permalink: '/r/worldnews/comments/abc123/a_post_title/',
    url: 'https://example.com/off-site',
    thumbnail: 'self',
    created_utc: 1700000000,
    ...over,
  };
}

describe('normalizeRedditPost', () => {
  it('maps a self post: fullname id, body in description, permalink, language, date', () => {
    const a = normalizeRedditPost(
      makeRedditPost({ title: 'Breaking news today', selftext: LONG_EN }),
      { originCountryCodes: ['CN'] }
    );
    expect(a).not.toBeNull();
    if (!a) return;
    expect(a.externalId).toBe('t3_abc123');
    expect(a.title).toBe('Breaking news today');
    expect(a.description).toBe(LONG_EN);
    expect(a.contentUrl).toBe('https://www.reddit.com/r/worldnews/comments/abc123/a_post_title/');
    expect(a.mediaType).toBe('text');
    expect(a.languageCodes).toEqual(['eng']);
    expect(a.originCountryCodes).toEqual(['CN']);
    expect(a.publishedAt).toBe('2023-11-14T22:13:20.000Z');
    expect(a.isAiGenerated).toBeNull();
  });

  it('uses the full-size preview image and image media type for an image post', () => {
    const a = normalizeRedditPost(
      makeRedditPost({
        post_hint: 'image',
        preview: { images: [{ source: { url: 'https://preview.redd.it/abc.jpg?width=1080' } }] },
      })
    );
    expect(a?.mediaType).toBe('image');
    expect(a?.thumbnailUrl).toBe('https://preview.redd.it/abc.jpg?width=1080');
  });

  it('marks hosted videos as video media type', () => {
    expect(normalizeRedditPost(makeRedditPost({ is_video: true }))?.mediaType).toBe('video');
  });

  it('returns null when the post has neither a fullname nor an id', () => {
    expect(normalizeRedditPost(makeRedditPost({ name: undefined, id: undefined }))).toBeNull();
  });

  it('ignores placeholder thumbnails and empty bodies for a bare link post', () => {
    const a = normalizeRedditPost(makeRedditPost({ selftext: '', thumbnail: 'default' }));
    expect(a?.description).toBeNull();
    expect(a?.thumbnailUrl).toBeNull();
  });

  it('falls back to the small thumbnail when it is a real URL and no preview exists', () => {
    const a = normalizeRedditPost(
      makeRedditPost({ thumbnail: 'https://b.thumbs.redditmedia.com/x.jpg' })
    );
    expect(a?.thumbnailUrl).toBe('https://b.thumbs.redditmedia.com/x.jpg');
  });
});

describe('normalizeRedditPosts', () => {
  it('normalizes posts and drops entries without an id', () => {
    const posts = [
      makeRedditPost({ name: 't3_p1', id: 'p1', title: LONG_EN }),
      makeRedditPost({ name: undefined, id: undefined }),
      makeRedditPost({ name: 't3_p3', id: 'p3', title: LONG_EN }),
    ];
    const out = normalizeRedditPosts(posts, { originCountryCodes: ['RU'] });
    expect(out).toHaveLength(2);
    expect(out.map((a) => a.externalId)).toEqual(['t3_p1', 't3_p3']);
    expect(out.every((a) => a.originCountryCodes?.[0] === 'RU')).toBe(true);
  });
});
