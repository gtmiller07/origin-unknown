/**
 * Backfill embeddings for artifacts that don't have one yet: read a bounded
 * batch missing an embedding, embed via OpenAI, write the vectors back, and
 * record spend in api_call_log. The DEFAULT_LIMIT keeps a single cron run
 * inside its time budget; the manual script drains the backlog by looping.
 */
import { eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { apiCallLog, artifacts } from '../db/schema';
import { EMBEDDING_USD_PER_TOKEN, embedTexts } from './embeddings';
import { embeddingInputText } from './text';

const DEFAULT_LIMIT = 500;
const BATCH_SIZE = 100;

export interface EmbedSummary {
  scanned: number;
  embedded: number;
  /** Rows with no embeddable text, skipped this run. */
  skipped: number;
  totalTokens: number;
  costUsd: number;
  batches: number;
}

export async function embedPendingArtifacts(
  opts: { limit?: number; batchSize?: number } = {}
): Promise<EmbedSummary> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const batchSize = opts.batchSize ?? BATCH_SIZE;

  const pending = await db
    .select({ id: artifacts.id, title: artifacts.title, description: artifacts.description })
    .from(artifacts)
    .where(isNull(artifacts.embedding))
    .limit(limit);

  const targets: { id: string; text: string }[] = [];
  for (const row of pending) {
    const text = embeddingInputText(row);
    if (text) targets.push({ id: row.id, text });
  }

  const summary: EmbedSummary = {
    scanned: pending.length,
    embedded: 0,
    skipped: pending.length - targets.length,
    totalTokens: 0,
    costUsd: 0,
    batches: 0,
  };

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    const startedAt = Date.now();
    const { embeddings, totalTokens } = await embedTexts(batch.map((t) => t.text));
    const durationMs = Date.now() - startedAt;

    for (let j = 0; j < batch.length; j++) {
      await db
        .update(artifacts)
        .set({ embedding: embeddings[j], updatedAt: new Date().toISOString() })
        .where(eq(artifacts.id, batch[j].id));
    }

    summary.embedded += batch.length;
    summary.totalTokens += totalTokens;
    summary.batches += 1;
    await logApiCall(totalTokens, durationMs);
  }

  summary.costUsd = Number((summary.totalTokens * EMBEDDING_USD_PER_TOKEN).toFixed(6));
  return summary;
}

/** Record spend for observability. Must never fail the embedding run. */
async function logApiCall(tokens: number, durationMs: number): Promise<void> {
  try {
    await db.insert(apiCallLog).values({
      service: 'openai',
      operation: 'embeddings',
      inputTokens: tokens,
      costUsd: (tokens * EMBEDDING_USD_PER_TOKEN).toFixed(6),
      durationMs,
      status: 'success',
    });
  } catch {
    // Intentionally swallowed: the log is observability, not correctness.
  }
}
