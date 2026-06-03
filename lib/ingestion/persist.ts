/**
 * Database operations shared by every ingestion adapter: source lookup,
 * ingestion_runs bookkeeping, and the artifacts upsert.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { type NewArtifact, type Source, artifacts, ingestionRuns, sources } from '../db/schema';
import type { IngestError, NormalizedArtifact, RunStatus } from './types';

export function getEnabledSources(category: string): Promise<Source[]> {
  return db
    .select()
    .from(sources)
    .where(and(eq(sources.category, category), eq(sources.enabled, true)));
}

export async function startRun(sourceId: string): Promise<string> {
  const [row] = await db
    .insert(ingestionRuns)
    .values({ sourceId, status: 'running' })
    .returning({ id: ingestionRuns.id });
  return row.id;
}

export async function completeRun(
  runId: string,
  result: { status: RunStatus; artifactsIngested: number; errors: IngestError[] }
): Promise<void> {
  await db
    .update(ingestionRuns)
    .set({
      completedAt: new Date().toISOString(),
      status: result.status,
      artifactsIngested: result.artifactsIngested,
      errors: result.errors.length ? result.errors : null,
    })
    .where(eq(ingestionRuns.id, runId));
}

export async function markSourceRun(sourceId: string, success: boolean): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(sources)
    .set({
      lastRunAt: now,
      updatedAt: now,
      ...(success
        ? { lastSuccessAt: now, consecutiveFailures: 0 }
        : { consecutiveFailures: sql`coalesce(${sources.consecutiveFailures}, 0) + 1` }),
    })
    .where(eq(sources.id, sourceId));
}

/**
 * Source-level options for {@link upsertArtifacts}.
 */
export interface UpsertOptions {
  /**
   * Authorship-origin prior asserted by the source, applied to inserted artifacts as their
   * ai_mediation value with provenance 'source_prior'. A per-artifact AI-origin flag
   * (isAiGenerated === true → 'ai_generated') takes precedence. Applied on INSERT only: a
   * re-ingest never overwrites an ai_mediation a scoring pass or manual backfill assigned.
   */
  aiMediationPrior?: string | null;
}

/**
 * Upsert by (sourceId, externalId). Re-ingest refreshes source-derived content but
 * deliberately leaves embedding, status, curatorial, and authorship (ai_mediation) fields
 * untouched. Returns the number of rows inserted or updated.
 */
export async function upsertArtifacts(
  sourceId: string,
  items: NormalizedArtifact[],
  opts: UpsertOptions = {}
): Promise<number> {
  if (!items.length) return 0;
  // A single ON CONFLICT DO UPDATE cannot touch the same (sourceId, externalId)
  // row twice, so collapse duplicate externalIds (mirror feeds, repeated guids)
  // before insert — last occurrence wins.
  const deduped = new Map<string, NewArtifact>();
  for (const item of items) {
    // Authorship-origin prior, written once at ingest so challenger (ai_generated/ai_assisted)
    // and incumbent (human_made) artifacts skip the relevance gate's Haiku triage. The
    // per-artifact flag is the strongest signal (Civitai marks every image/video
    // AI-generated); otherwise fall back to the source's declared prior; no signal → null
    // (ambiguous), exactly as before this option existed.
    const aiMediation =
      item.isAiGenerated === true ? 'ai_generated' : (opts.aiMediationPrior ?? null);
    deduped.set(item.externalId, {
      sourceId,
      externalId: item.externalId,
      title: item.title ?? null,
      description: item.description ?? null,
      contentUrl: item.contentUrl ?? null,
      thumbnailUrl: item.thumbnailUrl ?? null,
      mediaType: item.mediaType ?? null,
      languageCodes: item.languageCodes ?? null,
      originCountryCodes: item.originCountryCodes ?? null,
      publishedAt: item.publishedAt ?? null,
      isAiGenerated: item.isAiGenerated ?? null,
      aiMediation,
      aiMediationProvenance: aiMediation ? 'source_prior' : null,
      rawPayload: item.rawPayload ?? null,
    });
  }
  const rows = [...deduped.values()];

  const affected = await db
    .insert(artifacts)
    .values(rows)
    .onConflictDoUpdate({
      target: [artifacts.sourceId, artifacts.externalId],
      set: {
        title: sql`excluded.title`,
        description: sql`excluded.description`,
        contentUrl: sql`excluded.content_url`,
        thumbnailUrl: sql`excluded.thumbnail_url`,
        mediaType: sql`excluded.media_type`,
        languageCodes: sql`excluded.language_codes`,
        originCountryCodes: sql`excluded.origin_country_codes`,
        publishedAt: sql`excluded.published_at`,
        rawPayload: sql`excluded.raw_payload`,
        // ai_mediation / ai_mediation_provenance are intentionally NOT refreshed here: the
        // prior is an insert-time seed, so a re-ingest must not clobber a value the scorer
        // (provenance 'model') or a manual backfill later assigned.
        updatedAt: new Date().toISOString(),
      },
    })
    .returning({ id: artifacts.id });

  return affected.length;
}
