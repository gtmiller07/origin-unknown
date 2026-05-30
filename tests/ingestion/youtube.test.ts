import type { youtube_v3 } from 'googleapis';
import { describe, expect, it } from 'vitest';
import { normalizeYoutubeVideo, normalizeYoutubeVideos } from '../../lib/ingestion/youtube';

const LONG_EN =
  'Governments announce new cultural exchange initiatives to strengthen diplomatic ties worldwide.';

function makeVideo(
  over: {
    id?: string | null;
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: youtube_v3.Schema$ThumbnailDetails;
    omitSnippet?: boolean;
  } = {}
): youtube_v3.Schema$Video {
  const video: youtube_v3.Schema$Video = {
    id: over.id === undefined ? 'dQw4w9WgXcQ' : over.id,
  };
  if (!over.omitSnippet) {
    video.snippet = {
      title: over.title ?? 'A video title',
      description: over.description ?? '',
      publishedAt: over.publishedAt ?? '2026-05-01T12:00:00.000Z',
      thumbnails: over.thumbnails ?? {
        default: { url: 'https://i.ytimg.com/vi/x/default.jpg' },
        medium: { url: 'https://i.ytimg.com/vi/x/medium.jpg' },
        high: { url: 'https://i.ytimg.com/vi/x/high.jpg' },
        maxres: { url: 'https://i.ytimg.com/vi/x/maxres.jpg' },
      },
    };
  }
  return video;
}

describe('normalizeYoutubeVideo', () => {
  it('maps a video: id, title, description, watch url, language', () => {
    const a = normalizeYoutubeVideo(makeVideo({ title: LONG_EN, description: 'More detail.' }), {
      originCountryCodes: ['CN'],
    });
    expect(a).not.toBeNull();
    if (!a) return;
    expect(a.externalId).toBe('dQw4w9WgXcQ');
    expect(a.title).toBe(LONG_EN);
    expect(a.description).toBe('More detail.');
    expect(a.contentUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(a.mediaType).toBe('video');
    expect(a.languageCodes).toEqual(['eng']);
    expect(a.originCountryCodes).toEqual(['CN']);
    expect(a.publishedAt).toBe('2026-05-01T12:00:00.000Z');
    expect(a.isAiGenerated).toBeNull();
  });

  it('prefers the highest-resolution thumbnail', () => {
    const a = normalizeYoutubeVideo(makeVideo());
    expect(a?.thumbnailUrl).toBe('https://i.ytimg.com/vi/x/maxres.jpg');
  });

  it('walks down the thumbnail ladder when higher resolutions are absent', () => {
    const a = normalizeYoutubeVideo(
      makeVideo({ thumbnails: { medium: { url: 'https://i.ytimg.com/vi/x/medium.jpg' } } })
    );
    expect(a?.thumbnailUrl).toBe('https://i.ytimg.com/vi/x/medium.jpg');
  });

  it('returns null when the video has no id', () => {
    expect(normalizeYoutubeVideo(makeVideo({ id: null }))).toBeNull();
  });

  it('handles a missing snippet: null fields and no language', () => {
    const a = normalizeYoutubeVideo(makeVideo({ omitSnippet: true }));
    expect(a).not.toBeNull();
    if (!a) return;
    expect(a.title).toBeNull();
    expect(a.description).toBeNull();
    expect(a.thumbnailUrl).toBeNull();
    expect(a.languageCodes).toBeNull();
    expect(a.publishedAt).toBeNull();
  });
});

describe('normalizeYoutubeVideos', () => {
  it('normalizes videos and drops entries without an id', () => {
    const videos = [
      makeVideo({ id: 'aaa', title: LONG_EN }),
      makeVideo({ id: null }),
      makeVideo({ id: 'ccc', title: LONG_EN }),
    ];
    const out = normalizeYoutubeVideos(videos, { originCountryCodes: ['RU'] });
    expect(out).toHaveLength(2);
    expect(out.map((a) => a.externalId)).toEqual(['aaa', 'ccc']);
    expect(out.every((a) => a.originCountryCodes?.[0] === 'RU')).toBe(true);
  });
});
