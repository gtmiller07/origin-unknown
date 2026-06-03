/**
 * Per-source ingestion lifecycle, shared by all adapters. The adapter supplies a
 * fetcher; this wraps it with ingestion_runs bookkeeping and source health stats.
 */
import type { Source } from '../db/schema';
import { checkSourceRateLimit } from '../ratelimit';
import {
  completeRun,
  getEnabledSources,
  markSourceRun,
  startRun,
  upsertArtifacts,
} from './persist';
import type { FetchResult, RunStatus, RunSummary } from './types';

export async function runSourceIngest(
  source: Source,
  fetcher: (source: Source) => Promise<FetchResult>
): Promise<RunSummary> {
  const limitPerHour = source.rateLimitPerHour;
  if (limitPerHour && limitPerHour > 0) {
    const rl = await checkSourceRateLimit(source.id, limitPerHour);
    if (!rl.success) {
      return {
        sourceId: source.id,
        name: source.name,
        status: 'skipped',
        ingested: 0,
        errors: [],
        note: `rate limit reached (${limitPerHour}/h)`,
      };
    }
  }

  const runId = await startRun(source.id);
  try {
    const { items, errors } = await fetcher(source);
    // Carry the source's authorship-origin prior (if any) into the upsert so its artifacts
    // are classed (challenger/incumbent) at ingest instead of all landing ambiguous.
    const cfg = (source.config ?? {}) as { aiMediation?: string };
    const ingested = await upsertArtifacts(source.id, items, { aiMediationPrior: cfg.aiMediation });
    const status: RunStatus = errors.length === 0 ? 'success' : ingested > 0 ? 'partial' : 'failed';
    await completeRun(runId, { status, artifactsIngested: ingested, errors });
    await markSourceRun(source.id, status !== 'failed');
    return { sourceId: source.id, name: source.name, status, ingested, errors };
  } catch (err) {
    const errors = [{ message: err instanceof Error ? err.message : String(err) }];
    await completeRun(runId, { status: 'failed', artifactsIngested: 0, errors });
    await markSourceRun(source.id, false);
    return { sourceId: source.id, name: source.name, status: 'failed', ingested: 0, errors };
  }
}

/** Run every enabled source in a category through the given fetcher, sequentially. */
export async function ingestCategory(
  category: string,
  fetcher: (source: Source) => Promise<FetchResult>
): Promise<RunSummary[]> {
  const sourceRows = await getEnabledSources(category);
  const results: RunSummary[] = [];
  for (const source of sourceRows) {
    results.push(await runSourceIngest(source, fetcher));
  }
  return results;
}
