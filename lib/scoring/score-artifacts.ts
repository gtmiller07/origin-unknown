/**
 * Score artifacts that have an embedding but no scores yet. For each pending
 * artifact we render the active prompt, ask Claude for a structured six-axis
 * judgment, and persist it as a *proposal* — writing only the ai_* columns and
 * leaving value/human_* untouched so re-runs never clobber a human-confirmed
 * score. Every iteration is gated by the anthropic cost cap, and spend is logged
 * per artifact. At ~42s per Opus call against the route's 60s maxDuration,
 * exactly one artifact fits per serverless request, so DEFAULT_LIMIT is 1;
 * bulk/backlog scoring runs locally with no time ceiling via `npm run score`.
 */
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { scoreArtifactContent } from '../ai/claude';
import { isCapped } from '../cost/caps';
import { db } from '../db/client';
import {
  apiCallLog,
  artifacts,
  evidencePanels,
  scores,
  scoringEvents,
  scoringPrompts,
  sources,
} from '../db/schema';
import {
  type ArtifactForScoring,
  artifactMetadata,
  renderInstruction,
  sourceContext,
  thumbnailDescription,
} from './render';
import { AXIS_KEYS, type ScoringResult, ScoringResultSchema } from './rubric';

const DEFAULT_LIMIT = 1;

/**
 * Default scoring attempts per artifact. 1 = no retry, which keeps a single
 * serverless request inside its ~60s ceiling (one Opus call ≈ 42s; a second
 * attempt would risk being killed mid-flight, billing without logging). The local
 * backfill (scripts/score.ts) raises this to retry the rare malformed tool output
 * that survives the flattened schema, since it runs with no time ceiling.
 */
const DEFAULT_MAX_ATTEMPTS = 1;

export interface ScoreSummary {
  scanned: number;
  scored: number;
  failed: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  costUsd: number;
  /** True if the run halted early on the anthropic/aggregate cost cap. */
  capped: boolean;
  promptVersion: string | null;
  /** Categorised failure messages for artifacts that did not score this run. */
  errors: string[];
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** numeric(3,2) column → string, or null for an unscoreable axis. */
function toNumericString(value: number | null): string | null {
  return value === null ? null : clamp01(value).toFixed(2);
}

/**
 * `paglen_questions` is the one array left in the (now-flattened) tool schema, and
 * Claude's forced tool call occasionally serializes an array field as a JSON
 * *string* instead of a native value — an intermittent tool-use quirk, not bad
 * content: the judgment is complete, just double-encoded. Coerce it back before
 * validation so a good answer (and the tokens already billed for it) isn't thrown
 * away. The six axis scores are flat primitive fields now, so they can no longer be
 * double-encoded this way. Anything that still isn't valid JSON is left untouched
 * for ScoringResultSchema to reject, and markFailed handles it.
 */
function normalizeToolInput(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = { ...(raw as Record<string, unknown>) };
  const value = obj.paglen_questions;
  if (typeof value === 'string') {
    try {
      obj.paglen_questions = JSON.parse(value);
    } catch {
      // Not valid JSON — leave as-is; validation will reject it downstream.
    }
  }
  return obj;
}

export async function scorePendingArtifacts(
  opts: { limit?: number; maxAttempts?: number } = {}
): Promise<ScoreSummary> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);

  const summary: ScoreSummary = {
    scanned: 0,
    scored: 0,
    failed: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    costUsd: 0,
    capped: false,
    promptVersion: null,
    errors: [],
  };

  const [prompt] = await db
    .select()
    .from(scoringPrompts)
    .where(eq(scoringPrompts.active, true))
    .orderBy(desc(scoringPrompts.createdAt))
    .limit(1);

  if (!prompt) {
    throw new Error('No active scoring prompt found in scoring_prompts');
  }
  summary.promptVersion = prompt.version;

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
    .where(and(isNotNull(artifacts.embedding), eq(artifacts.status, 'pending')))
    .limit(limit);

  summary.scanned = pending.length;

  for (const row of pending) {
    if (await isCapped('anthropic')) {
      summary.capped = true;
      break;
    }

    const artifactForScoring: ArtifactForScoring = {
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
      metadata: artifactMetadata(artifactForScoring),
      thumbnail: thumbnailDescription({ thumbnailUrl: row.thumbnailUrl, mediaType: row.mediaType }),
      source: sourceContext({
        sourceName: row.sourceName,
        sourceCategory: row.sourceCategory,
        sourceNotes: row.sourceNotes,
      }),
    });

    // Score with a bounded retry. The flattened tool schema makes a malformed
    // payload rare, but an occasional intermittent quirk (or a transient API
    // error) is recoverable by simply re-calling. Every attempt that returns is
    // billed, so usage is accumulated across attempts and logged in full — even
    // on terminal failure — so spend is never blind.
    const startedAt = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    let costUsd = 0;
    let model = '';
    let result: ScoringResult | null = null;
    let parseError: string | null = null;
    let transportError: string | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let call: Awaited<ReturnType<typeof scoreArtifactContent>>;
      try {
        call = await scoreArtifactContent(prompt.systemPrompt, instruction);
      } catch (err) {
        // Transport/API failure: nothing trustworthy was billed this attempt.
        transportError = `api_call: ${errorMessage(err)}`;
        if (attempt < maxAttempts) {
          console.warn(
            `scoring: transport error on ${row.id} (attempt ${attempt}/${maxAttempts}), retrying`
          );
        }
        continue;
      }

      // A call returned: bill it and clear any prior transport error.
      inputTokens += call.usage.inputTokens;
      outputTokens += call.usage.outputTokens;
      costUsd += call.usage.costUsd;
      model = call.model;
      transportError = null;

      const parsed = ScoringResultSchema.safeParse(normalizeToolInput(call.toolInput));
      if (parsed.success) {
        result = parsed.data;
        parseError = null;
        break;
      }
      parseError = `parse_error: ${parsed.error.message.slice(0, 480)}`;
      if (attempt < maxAttempts) {
        console.warn(
          `scoring: malformed tool output on ${row.id} (attempt ${attempt}/${maxAttempts}), retrying`
        );
      }
    }
    const durationMs = Date.now() - startedAt;

    summary.totalInputTokens += inputTokens;
    summary.totalOutputTokens += outputTokens;
    summary.costUsd += costUsd;

    if (!result) {
      if (costUsd === 0 && transportError) {
        // Every attempt failed in transport with nothing billed: leave the
        // artifact 'pending' so the next run retries it.
        await logScoreCall({
          artifactId: row.id,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          durationMs,
          status: 'failed',
          errorMessage: transportError,
        });
        summary.errors.push(transportError);
        summary.failed += 1;
        continue;
      }
      // Real tokens were billed but no attempt produced a valid payload: record
      // the full spend and mark the artifact failed so it isn't retried in a loop.
      const message = parseError ?? transportError ?? 'scoring failed';
      await logScoreCall({
        artifactId: row.id,
        inputTokens,
        outputTokens,
        costUsd,
        durationMs,
        status: 'failed',
        errorMessage: message,
      });
      await markFailed(row.id);
      summary.errors.push(message);
      summary.failed += 1;
      continue;
    }

    const proposedAt = new Date().toISOString();

    // Taxonomy persistence with a source-derived ground-truth LOCK. The source
    // category fixes which fields are authoritative from the source (kept as the
    // 'source_prior' set by migration 0010, never overwritten by the model) versus
    // which the scorer may set or revise (recorded here as 'ai_proposed'):
    //   - genai_*        : ai_mediation = ai_generated is locked; authorship_class is a
    //                      soft prior the scorer may revise; origin_ambiguity is scorer-set.
    //   - state/cultural : authorship_class and ai_mediation are locked; origin_ambiguity scorer-set.
    //   - everything else: the scorer sets all three.
    // A locked field is omitted from the update, so its source_prior row value stands.
    const cat = row.sourceCategory;
    const isGenai = cat === 'genai_open_api' || cat === 'genai_curated_upload';
    const isInstitutional = cat === 'state_media_rss' || cat === 'cultural_institution';
    const taxonomyUpdate: Partial<{
      authorshipClass: string;
      authorshipClassProvenance: string;
      aiMediation: string;
      aiMediationProvenance: string;
      originAmbiguity: string;
      originAmbiguityProvenance: string;
    }> = {};
    if (!isInstitutional) {
      taxonomyUpdate.authorshipClass = result.authorship_class;
      taxonomyUpdate.authorshipClassProvenance = 'ai_proposed';
    }
    if (!isGenai && !isInstitutional) {
      taxonomyUpdate.aiMediation = result.ai_mediation;
      taxonomyUpdate.aiMediationProvenance = 'ai_proposed';
    }
    taxonomyUpdate.originAmbiguity = result.origin_ambiguity;
    taxonomyUpdate.originAmbiguityProvenance = 'ai_proposed';

    try {
      await db.transaction(async (tx) => {
        for (const axis of AXIS_KEYS) {
          const axisResult = result.scores[axis];
          const proposed = toNumericString(axisResult.value);
          await tx
            .insert(scores)
            .values({
              artifactId: row.id,
              axis,
              aiProposedValue: proposed,
              aiReasoning: axisResult.reasoning,
              aiModel: model,
              aiProposedAt: proposedAt,
              scoringPromptVersion: prompt.version,
              updatedAt: proposedAt,
            })
            .onConflictDoUpdate({
              target: [scores.artifactId, scores.axis],
              // Only the ai_* proposal columns are touched; value and the
              // human_* columns are deliberately left as-is.
              set: {
                aiProposedValue: proposed,
                aiReasoning: axisResult.reasoning,
                aiModel: model,
                aiProposedAt: proposedAt,
                scoringPromptVersion: prompt.version,
                updatedAt: proposedAt,
              },
            });

          await tx.insert(scoringEvents).values({
            artifactId: row.id,
            axis,
            eventType: 'ai_proposed',
            newValue: proposed,
            reasoning: axisResult.reasoning,
          });
        }

        await tx
          .insert(evidencePanels)
          .values({
            artifactId: row.id,
            paglenQuestions: result.paglen_questions,
            updatedAt: proposedAt,
          })
          .onConflictDoUpdate({
            target: evidencePanels.artifactId,
            set: { paglenQuestions: result.paglen_questions, updatedAt: proposedAt },
          });

        await tx
          .update(artifacts)
          .set({
            altText: result.alt_text,
            bearsOnDissertationQuestion: result.bears_on_dissertation_question,
            dissertationRelevance: result.dissertation_relevance,
            ...taxonomyUpdate,
            status: 'scored',
            updatedAt: proposedAt,
          })
          .where(eq(artifacts.id, row.id));
      });
    } catch (err) {
      // Persistence failed after a successful, billed call: record the spend and
      // leave status 'pending' so the proposal is regenerated next run.
      const message = `persist_error: ${errorMessage(err)}`;
      await logScoreCall({
        artifactId: row.id,
        inputTokens,
        outputTokens,
        costUsd,
        durationMs,
        status: 'failed',
        errorMessage: message,
      });
      summary.errors.push(message);
      summary.failed += 1;
      continue;
    }

    await logScoreCall({
      artifactId: row.id,
      inputTokens,
      outputTokens,
      costUsd,
      durationMs,
      status: 'success',
    });
    summary.scored += 1;
  }

  summary.costUsd = Number(summary.costUsd.toFixed(6));
  return summary;
}

/**
 * Mark an artifact's scoring as terminally failed after an unparseable payload.
 * Best-effort: a failure here must never abort the batch (the worst case is the
 * artifact stays 'pending' and is retried next run), so it is caught and
 * surfaced to platform logs rather than thrown — mirroring logScoreCall.
 */
async function markFailed(artifactId: string): Promise<void> {
  try {
    await db
      .update(artifacts)
      .set({ status: 'score_failed', updatedAt: new Date().toISOString() })
      .where(eq(artifacts.id, artifactId));
  } catch (err) {
    console.error(`markFailed: could not set score_failed for ${artifactId}`, err);
  }
}

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}

interface ScoreCallLog {
  artifactId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  status: string;
  errorMessage?: string;
}

/** Record spend/outcome for observability. Must never fail the scoring run. */
async function logScoreCall(entry: ScoreCallLog): Promise<void> {
  try {
    await db.insert(apiCallLog).values({
      service: 'anthropic',
      operation: 'scoring',
      artifactId: entry.artifactId,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      // costUsd null/<=0 is ignored by the apply_api_cost trigger, so a failed
      // call with no trustworthy spend never folds into the cost caps.
      costUsd: entry.costUsd > 0 ? entry.costUsd.toFixed(6) : null,
      durationMs: entry.durationMs,
      status: entry.status,
      errorMessage: entry.errorMessage,
    });
  } catch (err) {
    // The log is observability, not correctness — never fail the run over it.
    // But surface it to the platform logs: a silently-rejected insert (e.g. a
    // status that violates the api_call_log CHECK constraint) must not be able
    // to blind us again.
    console.error('logScoreCall: failed to write api_call_log row', err);
  }
}
