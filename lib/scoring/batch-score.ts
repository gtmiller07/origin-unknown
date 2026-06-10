/**
 * Bulk scoring via the Anthropic Message Batches API (~50% cost, no serverless timeout).
 * Two phases, both safe to re-run:
 *   submitScoringBatchJob() — select the gated queue (same predicate as the synchronous scorer),
 *     bounded by the REMAINING daily/monthly anthropic budget, build one request per artifact,
 *     submit, record a scoring_batches row, and stamp artifacts.scoring_batch_id so neither path
 *     re-selects them.
 *   pollAndIngestBatches() — for each open batch: poll; once ended, stream results and persist each
 *     succeeded result via the SAME persistScoringResult helper the synchronous path uses; revert
 *     errored/expired/canceled artifacts to the queue; log per-result spend (at the 50% batch rate)
 *     so the cost cap accrues; mark the batch ingested.
 *
 * The synchronous trickle (score-pending) stays for freshness; this carries the bulk volume.
 */
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  BATCH_USD_PER_INPUT_TOKEN,
  BATCH_USD_PER_OUTPUT_TOKEN,
  type ScoringBatchRequest,
  buildScoringParams,
  retrieveScoringBatch,
  streamScoringBatchResults,
  submitScoringBatch,
} from '../ai/claude';
import { db } from '../db/client';
import { apiCallLog, artifacts, scoringBatches, scoringPrompts, sources } from '../db/schema';
import { persistScoringResult } from './persist';
import {
  type ArtifactForScoring,
  artifactMetadata,
  renderInstruction,
  sourceContext,
  thumbnailDescription,
} from './render';
import { ScoringResultSchema } from './rubric';
import { normalizeToolInput } from './score-artifacts';

/** Estimated batch cost per artifact (~50% rate). Used to SIZE a batch and to pre-log committed
 * spend at submit so the daily cap reflects the commitment immediately (the actual bill accrues
 * async at ingest). Slightly above the observed ~$0.049 so we never under-count. */
const EST_USD_PER_ARTIFACT = 0.05;
/** Hard ceiling on a single batch regardless of budget (keeps submissions reviewable). */
const MAX_BATCH = 1000;
/** Daily budget reserved for the synchronous freshness trickle, so a batch never eats it all.
 * With ~$5 reserved, the sync cron can still score ~50 brand-new artifacts/day at full price. */
const FRESHNESS_RESERVE_USD = 5;

export interface SubmitSummary {
  batchId: string | null;
  requestCount: number;
  estCostUsd: number;
  reason?: string;
}

/** Remaining anthropic budget = min(daily, monthly) headroom, floored at 0. */
async function remainingAnthropicBudget(): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT GREATEST(daily_cap_usd - COALESCE(current_daily_spend_usd, 0), 0) AS daily,
           GREATEST(monthly_cap_usd - COALESCE(current_monthly_spend_usd, 0), 0) AS monthly
    FROM cost_caps WHERE service = 'anthropic' LIMIT 1
  `)) as unknown as Array<{ daily: number; monthly: number }>;
  if (!rows.length) return 0;
  return Math.max(0, Math.min(Number(rows[0]?.daily ?? 0), Number(rows[0]?.monthly ?? 0)));
}

/** Submit ONE batch sized to the remaining budget. Returns null batchId when nothing to do. */
export async function submitScoringBatchJob(
  opts: { maxRequests?: number } = {}
): Promise<SubmitSummary> {
  const [prompt] = await db
    .select()
    .from(scoringPrompts)
    .where(eq(scoringPrompts.active, true))
    .orderBy(desc(scoringPrompts.createdAt))
    .limit(1);
  if (!prompt) throw new Error('No active scoring prompt found in scoring_prompts');

  const budget = await remainingAnthropicBudget();
  // Leave a freshness reserve for the synchronous trickle; size the rest into this batch.
  const byBudget = Math.floor(Math.max(0, budget - FRESHNESS_RESERVE_USD) / EST_USD_PER_ARTIFACT);
  const limit = Math.max(0, Math.min(opts.maxRequests ?? MAX_BATCH, MAX_BATCH, byBudget));
  if (limit === 0) {
    return { batchId: null, requestCount: 0, estCostUsd: 0, reason: 'no remaining budget' };
  }

  // Same eligibility as the synchronous scorer, plus not-already-in-a-batch.
  const pending = await db
    .select({
      id: artifacts.id,
      title: artifacts.title,
      description: artifacts.description,
      contentUrl: artifacts.contentUrl,
      thumbnailUrl: artifacts.thumbnailUrl,
      mediaType: artifacts.mediaType,
      languageCodes: artifacts.languageCodes,
      originCountryCodes: artifacts.originCountryCodes,
      publishedAt: artifacts.publishedAt,
      isAiGenerated: artifacts.isAiGenerated,
      aiGenerationMetadata: artifacts.aiGenerationMetadata,
      externalId: artifacts.externalId,
      sourceName: sources.name,
      sourceCategory: sources.category,
      sourceNotes: sources.notes,
    })
    .from(artifacts)
    .leftJoin(sources, eq(artifacts.sourceId, sources.id))
    .where(
      and(
        isNotNull(artifacts.embedding),
        eq(artifacts.status, 'pending'),
        isNull(artifacts.scoringBatchId),
        eq(artifacts.gateDecision, 'include')
      )
    )
    .limit(limit);

  if (pending.length === 0) {
    return { batchId: null, requestCount: 0, estCostUsd: 0, reason: 'queue empty' };
  }

  const requests: ScoringBatchRequest[] = pending.map((row) => {
    const a: ArtifactForScoring = {
      title: row.title,
      description: row.description,
      contentUrl: row.contentUrl,
      thumbnailUrl: row.thumbnailUrl,
      mediaType: row.mediaType,
      languageCodes: row.languageCodes,
      originCountryCodes: row.originCountryCodes,
      publishedAt: row.publishedAt,
      isAiGenerated: row.isAiGenerated,
      aiGenerationMetadata: row.aiGenerationMetadata,
      externalId: row.externalId,
    };
    const instruction = renderInstruction(prompt.instructionTemplate, {
      metadata: artifactMetadata(a),
      thumbnail: thumbnailDescription({ thumbnailUrl: row.thumbnailUrl, mediaType: row.mediaType }),
      source: sourceContext({
        sourceName: row.sourceName,
        sourceCategory: row.sourceCategory,
        sourceNotes: row.sourceNotes,
      }),
    });
    return { custom_id: row.id, params: buildScoringParams(prompt.systemPrompt, instruction) };
  });

  const batch = await submitScoringBatch(requests);
  const estCost = Number((requests.length * EST_USD_PER_ARTIFACT).toFixed(4));

  // Record the batch, stamp the artifacts as in-flight, and PRE-LOG the estimated spend so the
  // daily cost cap reflects this committed batch immediately (the real bill accrues async at
  // ingest; the delta is reconciled there). Without this, the synchronous trickle would keep
  // spending against a cap that hasn't yet seen the batch, busting the daily budget.
  await db.transaction(async (tx) => {
    await tx.insert(scoringBatches).values({
      id: batch.id,
      status: 'submitted',
      requestCount: requests.length,
      estCostUsd: estCost.toFixed(4),
      scoringPromptVersion: prompt.version,
    });
    await tx
      .update(artifacts)
      .set({ scoringBatchId: batch.id, updatedAt: new Date().toISOString() })
      .where(
        inArray(
          artifacts.id,
          requests.map((r) => r.custom_id)
        )
      );
    await tx.insert(apiCallLog).values({
      service: 'anthropic',
      operation: 'scoring_batch_estimate',
      costUsd: estCost.toFixed(6),
      status: 'success',
    });
  });

  return { batchId: batch.id, requestCount: requests.length, estCostUsd: estCost };
}

export interface PollSummary {
  batchesChecked: number;
  ingested: number;
  failed: number;
  stillRunning: number;
}

/** Poll all open batches; ingest results from any that have ended. */
export async function pollAndIngestBatches(): Promise<PollSummary> {
  const open = await db
    .select()
    .from(scoringBatches)
    .where(inArray(scoringBatches.status, ['submitted', 'in_progress', 'ended']));

  const summary: PollSummary = { batchesChecked: 0, ingested: 0, failed: 0, stillRunning: 0 };

  const [prompt] = await db
    .select()
    .from(scoringPrompts)
    .where(eq(scoringPrompts.active, true))
    .orderBy(desc(scoringPrompts.createdAt))
    .limit(1);
  const promptVersion = prompt?.version ?? 'unknown';

  for (const b of open) {
    summary.batchesChecked += 1;
    const remote = await retrieveScoringBatch(b.id);

    if (remote.processing_status !== 'ended') {
      await db
        .update(scoringBatches)
        .set({ status: 'in_progress', updatedAt: new Date().toISOString() })
        .where(eq(scoringBatches.id, b.id));
      summary.stillRunning += 1;
      continue;
    }

    // Ended: stream results and persist.
    const res = await ingestEndedBatch(b.id, promptVersion);
    summary.ingested += res.ingested;
    summary.failed += res.failed;
  }

  return summary;
}

async function ingestEndedBatch(
  batchId: string,
  promptVersion: string
): Promise<{ ingested: number; failed: number }> {
  // Source-category lookup for the taxonomy lock, by artifact id (custom_id).
  const stream = await streamScoringBatchResults(batchId);
  let ingested = 0;
  let failed = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const entry of stream) {
    const artifactId = entry.custom_id;
    const result = entry.result;

    if (result.type !== 'succeeded') {
      // errored / expired / canceled → return the artifact to the queue for a future batch.
      await db
        .update(artifacts)
        .set({ scoringBatchId: null, updatedAt: new Date().toISOString() })
        .where(eq(artifacts.id, artifactId));
      failed += 1;
      continue;
    }

    const message = result.message;
    const toolUse = message.content.find((b) => b.type === 'tool_use');
    const usage = message.usage;
    inputTokens += usage?.input_tokens ?? 0;
    outputTokens += usage?.output_tokens ?? 0;

    const parsed = ScoringResultSchema.safeParse(
      normalizeToolInput(toolUse && toolUse.type === 'tool_use' ? toolUse.input : undefined)
    );
    if (!parsed.success) {
      await db
        .update(artifacts)
        .set({ status: 'score_failed', scoringBatchId: null, updatedAt: new Date().toISOString() })
        .where(eq(artifacts.id, artifactId));
      failed += 1;
      continue;
    }

    // Look up the source category (taxonomy lock) + current status (idempotency).
    const [meta] = (await db.execute(sql`
      SELECT src.category AS category, a.status AS status
      FROM artifacts a LEFT JOIN sources src ON src.id = a.source_id
      WHERE a.id = ${artifactId} LIMIT 1
    `)) as unknown as Array<{ category: string | null; status: string | null }>;

    // Already scored (e.g. a re-poll after a mid-ingest timeout) → skip to avoid duplicate
    // scoring_events rows. Idempotent resume.
    if (meta?.status === 'scored') {
      ingested += 1;
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        await persistScoringResult({
          tx,
          artifactId,
          sourceCategory: meta?.category ?? null,
          result: parsed.data,
          model: message.model,
          promptVersion,
        });
      });
      ingested += 1;
    } catch {
      await db
        .update(artifacts)
        .set({ scoringBatchId: null, updatedAt: new Date().toISOString() })
        .where(eq(artifacts.id, artifactId));
      failed += 1;
    }
  }

  // Actual spend at the 50% batch rate. The estimate was already logged at submit, so accrue only
  // the positive delta (actual − estimate) to the cap — never negative, keeping us conservative
  // (if actual < estimate, the slightly-high estimate stands, which can't cause an overspend).
  const costUsd = inputTokens * BATCH_USD_PER_INPUT_TOKEN + outputTokens * BATCH_USD_PER_OUTPUT_TOKEN;
  const [batchRow] = await db
    .select({ est: scoringBatches.estCostUsd })
    .from(scoringBatches)
    .where(eq(scoringBatches.id, batchId))
    .limit(1);
  const est = Number(batchRow?.est ?? 0);
  const delta = costUsd - est;
  try {
    await db.insert(apiCallLog).values({
      service: 'anthropic',
      operation: 'scoring_batch',
      inputTokens,
      outputTokens,
      costUsd: delta > 0 ? delta.toFixed(6) : null, // null/≤0 is ignored by the apply_api_cost trigger
      status: 'success',
    });
  } catch {
    // observability only
  }

  await db
    .update(scoringBatches)
    .set({
      status: 'ingested',
      ingestedCount: ingested,
      failedCount: failed,
      actualCostUsd: costUsd.toFixed(4),
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(scoringBatches.id, batchId));

  return { ingested, failed };
}
