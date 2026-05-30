/**
 * Provider dispatcher for the `genai_open_api` category. The category spans multiple open-GenAI
 * providers — the Hugging Face Hub (supply side: where models/datasets are built) and Civitai
 * (output side: actual AI-generated images). ingestCategory runs a single fetcher across every
 * source in a category, so this fans each source out to its provider adapter by reading the
 * `provider` discriminator on the source config. An absent provider means 'huggingface' — the
 * original Hub-only sources predate the discriminator and keep working untouched.
 */
import type { Source } from '../db/schema';
import { fetchCivitaiArtifacts } from './civitai';
import { fetchHuggingFaceArtifacts } from './huggingface';
import type { FetchResult, GenaiProvider } from './types';

export async function fetchGenaiOpenArtifacts(source: Source): Promise<FetchResult> {
  const provider = ((source.config ?? {}) as { provider?: GenaiProvider }).provider;
  switch (provider) {
    case 'civitai':
      return fetchCivitaiArtifacts(source);
    default:
      // 'huggingface' or absent (the original Hub-only sources).
      return fetchHuggingFaceArtifacts(source);
  }
}
