/**
 * Hugging Face Hub adapter for the `genai_open_api` source category — the open
 * REST API over fetch, no SDK.
 *
 * normalizeHuggingFaceRepo / normalizeHuggingFaceRepos are pure (a Hub model/dataset
 * row -> NormalizedArtifact[]) and unit-tested offline. fetchHuggingFaceArtifacts wraps
 * them with the network: one list call returns the configured slice (e.g. trending
 * text-generation models), most-relevant first.
 *
 * Unlike the YouTube and Reddit adapters, the Hub read API needs NO credentials —
 * anonymous reads work from anywhere — so there is no graceful-skip gate. An optional
 * HUGGINGFACE_TOKEN (or HF_TOKEN) is attached when present, purely to raise rate limits.
 *
 * These artifacts are deliberately metadata-centric: the cheap list endpoint carries no
 * README prose, so `description` and `languageCodes` are left null and the structured
 * signal (tags, pipeline, author, downloads, likes, timestamps) rides in rawPayload. The
 * repo id is both the title and the (sourceId, externalId) upsert key.
 */
import type { Source } from '../db/schema';
import { parseDate } from './text';
import type {
  FetchResult,
  HuggingFaceSourceConfig,
  IngestError,
  NormalizedArtifact,
} from './types';

const API_BASE = 'https://huggingface.co/api';
const USER_AGENT = 'origin-unknown/0.1 (+https://origin-unknown.vercel.app)';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const FETCH_TIMEOUT_MS = 15_000;

/** Friendly config sort -> the Hub's `sort` query value; always paired with direction=-1. */
const SORTS: Record<string, string> = {
  trending: 'trendingScore',
  downloads: 'downloads',
  likes: 'likes',
  lastModified: 'lastModified',
  createdAt: 'createdAt',
};

/** Minimal shape of a Hub model/dataset row; everything else rides in rawPayload. */
export interface HuggingFaceRepo {
  _id?: string;
  id?: string;
  author?: string;
  pipeline_tag?: string;
  library_name?: string;
  tags?: string[];
  downloads?: number;
  likes?: number;
  trendingScore?: number;
  createdAt?: string;
  lastModified?: string;
  private?: boolean;
  gated?: boolean | string;
  cardData?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface HuggingFaceNormalizeOptions {
  repoType?: 'model' | 'dataset';
  originCountryCodes?: string[] | null;
}

/** Public Hub URL for a repo; datasets sit under the /datasets/ prefix, models at the root. */
function repoUrl(repoType: 'model' | 'dataset', id: string): string {
  return repoType === 'dataset'
    ? `https://huggingface.co/datasets/${id}`
    : `https://huggingface.co/${id}`;
}

export function normalizeHuggingFaceRepo(
  repo: HuggingFaceRepo,
  opts: HuggingFaceNormalizeOptions = {}
): NormalizedArtifact | null {
  // The repo id (e.g. "stabilityai/stable-diffusion-3.5-large") is globally unique on the
  // Hub and the stable upsert key; without it there is nothing to anchor the artifact to.
  const externalId = repo.id;
  if (!externalId) return null;

  const repoType = opts.repoType === 'dataset' ? 'dataset' : 'model';

  return {
    externalId,
    title: externalId,
    // The list endpoint carries no README prose, and a repo slug is not natural language,
    // so description and detected language stay null; the declared signal (tags,
    // pipeline_tag, cardData.language, stats) rides in rawPayload for later analysis.
    description: null,
    contentUrl: repoUrl(repoType, externalId),
    thumbnailUrl: null,
    // 'text' is the artifact's medium (a textual metadata record). The model-vs-dataset
    // kind lives in the source, contentUrl, and rawPayload — not in media_type, whose
    // CHECK vocabulary is image/video/audio/text/mixed.
    mediaType: 'text',
    languageCodes: null,
    originCountryCodes: opts.originCountryCodes ?? null,
    // createdAt is the repo's birth; fall back to lastModified when it is absent.
    publishedAt: parseDate(repo.createdAt ?? repo.lastModified),
    isAiGenerated: null,
    rawPayload: repo,
  };
}

export function normalizeHuggingFaceRepos(
  repos: HuggingFaceRepo[],
  opts: HuggingFaceNormalizeOptions = {}
): NormalizedArtifact[] {
  const out: NormalizedArtifact[] = [];
  for (const repo of repos) {
    const normalized = normalizeHuggingFaceRepo(repo, opts);
    if (normalized) out.push(normalized);
  }
  return out;
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

async function fetchRepos(url: URL): Promise<HuggingFaceRepo[]> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': USER_AGENT,
  };
  // The token only raises anonymous rate limits; reads work without it, so there is no
  // credential gate (unlike YouTube/Reddit, which return empty when their keys are absent).
  const token = process.env.HUGGINGFACE_TOKEN ?? process.env.HF_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as unknown;
  return Array.isArray(json) ? (json as HuggingFaceRepo[]) : [];
}

export async function fetchHuggingFaceArtifacts(source: Source): Promise<FetchResult> {
  const config = (source.config ?? {}) as HuggingFaceSourceConfig;
  const repoType = config.repoType === 'dataset' ? 'dataset' : 'model';
  const items: NormalizedArtifact[] = [];
  const errors: IngestError[] = [];

  const endpoint = repoType === 'dataset' ? 'datasets' : 'models';
  const url = new URL(`${API_BASE}/${endpoint}`);
  url.searchParams.set('sort', SORTS[config.sort ?? 'trending'] ?? SORTS.trending);
  url.searchParams.set('direction', '-1');
  url.searchParams.set('limit', String(clampLimit(config.limit)));
  // full=true enriches each row with tags/pipeline/library/stats for rawPayload.
  url.searchParams.set('full', 'true');
  if (config.filter) url.searchParams.set('filter', config.filter);
  if (config.search) url.searchParams.set('search', config.search);

  try {
    const repos = await fetchRepos(url);
    items.push(
      ...normalizeHuggingFaceRepos(repos, {
        repoType,
        originCountryCodes: config.originCountryCodes,
      })
    );
  } catch (err) {
    errors.push({
      feed: `${endpoint}:${config.filter ?? config.search ?? config.sort ?? 'trending'}`,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return { items, errors };
}
