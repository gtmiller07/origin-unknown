/**
 * OpenAI embeddings client wrapper. Thin and lazily-initialised so importing
 * this module never requires OPENAI_API_KEY until an embedding is requested,
 * keeping the pure pipeline logic (embed-artifacts) testable around it.
 */
import OpenAI from 'openai';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;
/** USD per input token for text-embedding-3-small ($0.02 / 1M tokens). */
export const EMBEDDING_USD_PER_TOKEN = 0.02 / 1_000_000;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  client ??= new OpenAI({ apiKey });
  return client;
}

export interface EmbedBatchResult {
  /** One vector per input, in input order. */
  embeddings: number[][];
  totalTokens: number;
}

/** Embed texts in input order. The caller must keep batches within API limits. */
export async function embedTexts(texts: string[]): Promise<EmbedBatchResult> {
  if (!texts.length) return { embeddings: [], totalTokens: 0 };
  const res = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  // The API returns results in order, but sort by index defensively.
  const embeddings = [...res.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  return { embeddings, totalTokens: res.usage.total_tokens };
}
