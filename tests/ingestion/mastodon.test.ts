import { describe, expect, it } from 'vitest';
import {
  type MastodonStatus,
  normalizeMastodonStatus,
  normalizeMastodonStatuses,
} from '../../lib/ingestion/mastodon';

const LONG_EN =
  'Governments announce new cultural exchange initiatives to strengthen diplomatic ties worldwide.';

function makeStatus(over: Partial<MastodonStatus> = {}): MastodonStatus {
  return {
    id: '111222333',
    uri: 'https://mastodon.social/users/alice/statuses/111222333',
    url: 'https://mastodon.social/@alice/111222333',
    content: '<p>Hello fediverse</p>',
    created_at: '2026-05-23T08:04:52.000Z',
    language: 'en',
    sensitive: false,
    spoiler_text: '',
    visibility: 'public',
    media_attachments: [],
    ...over,
  };
}

describe('normalizeMastodonStatus', () => {
  it('maps a status: uri->external id, stripped body in description, url, language, date', () => {
    const status = makeStatus({ content: `<p>${LONG_EN}</p>` });
    const a = normalizeMastodonStatus(status, { originCountryCodes: ['DE'] });
    expect(a).not.toBeNull();
    if (!a) return;
    expect(a.externalId).toBe('https://mastodon.social/users/alice/statuses/111222333');
    expect(a.title).toBeNull();
    expect(a.description).toBe(LONG_EN);
    expect(a.contentUrl).toBe('https://mastodon.social/@alice/111222333');
    expect(a.mediaType).toBe('text');
    expect(a.languageCodes).toEqual(['eng']);
    expect(a.originCountryCodes).toEqual(['DE']);
    expect(a.publishedAt).toBe('2026-05-23T08:04:52.000Z');
    expect(a.isAiGenerated).toBeNull();
    expect(a.rawPayload).toBe(status);
  });

  it('strips HTML tags and decodes entities in the body', () => {
    const a = normalizeMastodonStatus(
      makeStatus({ content: '<p>Tom &amp; Jerry &lt;3</p><p>second line</p>' })
    );
    expect(a?.description).toBe('Tom & Jerry <3 second line');
  });

  it('maps an image attachment to image media type and the preview-url thumbnail', () => {
    const a = normalizeMastodonStatus(
      makeStatus({
        media_attachments: [
          {
            type: 'image',
            url: 'https://files.mastodon.social/x.png',
            preview_url: 'https://files.mastodon.social/x_small.png',
          },
        ],
      })
    );
    expect(a?.mediaType).toBe('image');
    expect(a?.thumbnailUrl).toBe('https://files.mastodon.social/x_small.png');
  });

  it('maps a gifv attachment to the video media type', () => {
    const a = normalizeMastodonStatus(
      makeStatus({ media_attachments: [{ type: 'gifv', url: 'https://files/x.mp4' }] })
    );
    expect(a?.mediaType).toBe('video');
  });

  it('maps an audio attachment to the audio media type', () => {
    const a = normalizeMastodonStatus(
      makeStatus({ media_attachments: [{ type: 'audio', url: 'https://files/x.mp3' }] })
    );
    expect(a?.mediaType).toBe('audio');
  });

  it('maps attachments of differing kinds to the mixed media type', () => {
    const a = normalizeMastodonStatus(
      makeStatus({
        media_attachments: [
          { type: 'image', preview_url: 'https://files/i.png' },
          { type: 'video', preview_url: 'https://files/v.jpg' },
        ],
      })
    );
    expect(a?.mediaType).toBe('mixed');
    expect(a?.thumbnailUrl).toBe('https://files/i.png');
  });

  it('drops a boost (reblog) of another status', () => {
    expect(normalizeMastodonStatus(makeStatus({ reblog: makeStatus({ id: '999' }) }))).toBeNull();
  });

  it('falls back to the human url, then the local id, for the external id', () => {
    expect(normalizeMastodonStatus(makeStatus({ uri: undefined }))?.externalId).toBe(
      'https://mastodon.social/@alice/111222333'
    );
    expect(
      normalizeMastodonStatus(makeStatus({ uri: undefined, url: undefined }))?.externalId
    ).toBe('111222333');
  });

  it('returns null when the status has no uri, url, or id', () => {
    expect(
      normalizeMastodonStatus(makeStatus({ uri: undefined, url: undefined, id: undefined }))
    ).toBeNull();
  });

  it('has a null published date when created_at is absent', () => {
    expect(normalizeMastodonStatus(makeStatus({ created_at: undefined }))?.publishedAt).toBeNull();
  });
});

describe('normalizeMastodonStatuses', () => {
  it('normalizes statuses and drops boosts and entries without an id', () => {
    const statuses = [
      makeStatus({ uri: 'tag:s1', content: `<p>${LONG_EN}</p>` }),
      makeStatus({ reblog: makeStatus({ id: 'boosted' }) }),
      makeStatus({ uri: undefined, url: undefined, id: undefined }),
      makeStatus({ uri: 'tag:s2', content: `<p>${LONG_EN}</p>` }),
    ];
    const out = normalizeMastodonStatuses(statuses, { originCountryCodes: ['JP'] });
    expect(out).toHaveLength(2);
    expect(out.map((a) => a.externalId)).toEqual(['tag:s1', 'tag:s2']);
    expect(out.every((a) => a.originCountryCodes?.[0] === 'JP')).toBe(true);
    expect(out.every((a) => a.isAiGenerated === null)).toBe(true);
  });
});
