import { describe, expect, it } from 'vitest';
import {
  type CivitaiImage,
  normalizeCivitaiImage,
  normalizeCivitaiImages,
} from '../../lib/ingestion/civitai';

function makeImage(over: Partial<CivitaiImage> = {}): CivitaiImage {
  return {
    id: 131556219,
    url: 'https://image.civitai.com/abc/def/original=true/def.jpeg',
    width: 1024,
    height: 1536,
    type: 'image',
    nsfw: false,
    nsfwLevel: 'None',
    createdAt: '2026-05-23T08:04:52.862Z',
    postId: 28758860,
    username: 'Spike26',
    baseModel: 'OpenAI',
    stats: { likeCount: 10, heartCount: 5, commentCount: 2 },
    meta: {
      prompt: 'a serene watercolor painting of a lone samurai on a misty mountain',
      seed: 123,
    },
    ...over,
  };
}

describe('normalizeCivitaiImage', () => {
  it('maps an image: id->external id, prompt->title+description, image url, isAiGenerated true', () => {
    const image = makeImage();
    const a = normalizeCivitaiImage(image, { originCountryCodes: ['US'] });
    expect(a).not.toBeNull();
    if (!a) return;
    expect(a.externalId).toBe('131556219');
    expect(a.title).toBe('a serene watercolor painting of a lone samurai on a misty mountain');
    expect(a.description).toBe(
      'a serene watercolor painting of a lone samurai on a misty mountain'
    );
    expect(a.contentUrl).toBe('https://civitai.com/images/131556219');
    expect(a.thumbnailUrl).toBe('https://image.civitai.com/abc/def/original=true/def.jpeg');
    expect(a.mediaType).toBe('image');
    expect(a.languageCodes).toEqual(['eng']);
    expect(a.originCountryCodes).toEqual(['US']);
    expect(a.publishedAt).toBe('2026-05-23T08:04:52.862Z');
    expect(a.isAiGenerated).toBe(true);
    expect(a.rawPayload).toBe(image);
  });

  it('truncates a long prompt for the title but keeps the full prompt in description', () => {
    const prompt =
      'cinematic portrait of a cyberpunk samurai, neon rain, ultra detailed, volumetric lighting, 8k, masterpiece, intricate glowing armor, dramatic atmosphere, concept art';
    const a = normalizeCivitaiImage(makeImage({ meta: { prompt } }));
    expect(a).not.toBeNull();
    const title = a?.title;
    if (title == null) return;
    expect(a?.description).toBe(prompt);
    expect(title.length).toBeLessThanOrEqual(141);
    expect(title.endsWith('…')).toBe(true);
    expect(prompt.startsWith(title.slice(0, 20))).toBe(true);
  });

  it('maps a video post to the video media type', () => {
    expect(normalizeCivitaiImage(makeImage({ type: 'video' }))?.mediaType).toBe('video');
  });

  it('drops NSFW images (flagged boolean or rated above None)', () => {
    expect(normalizeCivitaiImage(makeImage({ nsfwLevel: 'Mature' }))).toBeNull();
    expect(normalizeCivitaiImage(makeImage({ nsfwLevel: 'X' }))).toBeNull();
    expect(normalizeCivitaiImage(makeImage({ nsfw: true }))).toBeNull();
  });

  it('falls back to a synthetic title and null language when the prompt is absent', () => {
    const a = normalizeCivitaiImage(makeImage({ meta: null }));
    expect(a?.title).toBe('Civitai image 131556219');
    expect(a?.description).toBeNull();
    expect(a?.languageCodes).toBeNull();
  });

  it('returns null when the image has no id', () => {
    expect(normalizeCivitaiImage(makeImage({ id: undefined }))).toBeNull();
  });

  it('has a null published date when createdAt is absent', () => {
    expect(normalizeCivitaiImage(makeImage({ createdAt: undefined }))?.publishedAt).toBeNull();
  });
});

describe('normalizeCivitaiImages', () => {
  it('normalizes images and drops entries without an id or that are NSFW', () => {
    const images = [
      makeImage({ id: 1 }),
      makeImage({ id: undefined }),
      makeImage({ id: 2, nsfwLevel: 'X' }),
      makeImage({ id: 3 }),
    ];
    const out = normalizeCivitaiImages(images, { originCountryCodes: ['CN'] });
    expect(out).toHaveLength(2);
    expect(out.map((a) => a.externalId)).toEqual(['1', '3']);
    expect(out.every((a) => a.originCountryCodes?.[0] === 'CN')).toBe(true);
    expect(out.every((a) => a.isAiGenerated === true)).toBe(true);
  });
});
