import { describe, expect, it } from 'vitest';
import {
  type HuggingFaceRepo,
  normalizeHuggingFaceRepo,
  normalizeHuggingFaceRepos,
} from '../../lib/ingestion/huggingface';

function makeRepo(over: Partial<HuggingFaceRepo> = {}): HuggingFaceRepo {
  return {
    _id: '650abc1234567890',
    id: 'meta-llama/Meta-Llama-3-8B',
    author: 'meta-llama',
    pipeline_tag: 'text-generation',
    tags: ['text-generation', 'en', 'llama'],
    downloads: 1_000_000,
    likes: 5000,
    createdAt: '2024-04-18T00:00:00.000Z',
    lastModified: '2024-05-01T00:00:00.000Z',
    ...over,
  };
}

describe('normalizeHuggingFaceRepo', () => {
  it('maps a model repo: id as external id + title, model url, text media type, createdAt, raw payload', () => {
    const repo = makeRepo();
    const a = normalizeHuggingFaceRepo(repo, { originCountryCodes: ['US'] });
    expect(a).not.toBeNull();
    if (!a) return;
    expect(a.externalId).toBe('meta-llama/Meta-Llama-3-8B');
    expect(a.title).toBe('meta-llama/Meta-Llama-3-8B');
    expect(a.contentUrl).toBe('https://huggingface.co/meta-llama/Meta-Llama-3-8B');
    expect(a.mediaType).toBe('text');
    expect(a.description).toBeNull();
    expect(a.languageCodes).toBeNull();
    expect(a.thumbnailUrl).toBeNull();
    expect(a.originCountryCodes).toEqual(['US']);
    expect(a.publishedAt).toBe('2024-04-18T00:00:00.000Z');
    expect(a.isAiGenerated).toBeNull();
    expect(a.rawPayload).toBe(repo);
  });

  it('uses the dataset url when repoType is dataset (media type stays text)', () => {
    const a = normalizeHuggingFaceRepo(makeRepo({ id: 'HuggingFaceFW/fineweb' }), {
      repoType: 'dataset',
    });
    expect(a?.contentUrl).toBe('https://huggingface.co/datasets/HuggingFaceFW/fineweb');
    expect(a?.mediaType).toBe('text');
  });

  it('falls back to lastModified when createdAt is absent', () => {
    const a = normalizeHuggingFaceRepo(
      makeRepo({ createdAt: undefined, lastModified: '2023-01-02T03:04:05.000Z' })
    );
    expect(a?.publishedAt).toBe('2023-01-02T03:04:05.000Z');
  });

  it('has a null published date when neither timestamp is present', () => {
    const a = normalizeHuggingFaceRepo(makeRepo({ createdAt: undefined, lastModified: undefined }));
    expect(a?.publishedAt).toBeNull();
  });

  it('returns null when the repo has no id', () => {
    expect(normalizeHuggingFaceRepo(makeRepo({ id: undefined }))).toBeNull();
  });
});

describe('normalizeHuggingFaceRepos', () => {
  it('normalizes repos and drops entries without an id', () => {
    const repos = [
      makeRepo({ id: 'org/a' }),
      makeRepo({ id: undefined }),
      makeRepo({ id: 'org/b' }),
    ];
    const out = normalizeHuggingFaceRepos(repos, { originCountryCodes: ['CN'] });
    expect(out).toHaveLength(2);
    expect(out.map((a) => a.externalId)).toEqual(['org/a', 'org/b']);
    expect(out.every((a) => a.originCountryCodes?.[0] === 'CN')).toBe(true);
  });
});
