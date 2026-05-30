/**
 * Score artifacts that have an embedding but no scores yet. For each pending
 * artifact we render the active prompt, ask Claude for a structured six-axis
 * judgment, and persist it as a *proposal* — writing only the ai_* columns and
 * leaving value/human_* untouched so re-runs never clobber a human-confirmed
 * score. Every iteration is gated by the anthropic cost cap, and spend is logged
 * per artifact. The conservative DEFAULT_LIMIT keeps one cron run inside its
 * time budget; calibrate it upward after the controlled first run.
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
import { AXIS_KEYS, ScoringResultSchema } from './rubric';

const DEFAULT_LIMIT = 3;

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

export async function scorePendingArtifacts(opts: { limit?: number } = {}): Promise<ScoreSummary> {
  const limit = opts.limit ?? DEFAULT_LIMIT;

  const summary: ScoreSummary = {
    scanned: 0,
    scored: 0,
    failed: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    costUsd: 0,
    capped: false,
    promptVersion: null,
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

    const startedAt = Date.now();
    let call: Awaited<ReturnType<typeof scoreArtifactContent>>;
    try {
      call = await scoreArtifactContent(prompt.systemPrompt, instruction);
    } catch (err) {
      // Transport/API failure: nothing trustworthy was billed, so leave the
      // artifact 'pending' and let the next run retry it.
      await logScoreCall({
        artifactId: row.id,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        durationMs: Date.now() - startedAt,
        status: 'error',
        errorMessage: errorMessage(err),
      });
      summary.failed += 1;
      continue;
    }
    const durationMs = Date.now() - startedAt;

    summary.totalInputTokens += call.usage.inputTokens;
    summary.totalOutputTokens += call.usage.outputTokens;
    summary.costUsd += call.usage.costUsd;

    const parsed = ScoringResultSchema.safeParse(call.toolInput);
    if (!parsed.success) {
      // The call cost real tokens even though the payload was malformed: record
      // the spend and mark the artifact failed so it isn't retried in a loop.
      await logScoreCall({
        artifactId: row.id,
        inputTokens: call.usage.inputTokens,
        outputTokens: call.usage.outputTokens,
        costUsd: call.usage.costUsd,
        durationMs,
        status: 'parse_error',
        errorMessage: parsed.error.message.slice(0, 500),
      });
      await markFailed(row.id);
      summary.failed += 1;
      continue;
    }

    const result = parsed.data;
    const proposedAt = new Date().toISOString();

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
              aiModel: call.model,
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
                aiModel: call.model,
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
            status: 'scored',
            updatedAt: proposedAt,
          })
          .where(eq(artifacts.id, row.id));
      });
    } catch (err) {
      // Persistence failed after a successful, billed call: record the spend and
      // leave status 'pending' so the proposal is regenerated next run.
      await logScoreCall({
        artifactId: row.id,
        inputTokens: call.usage.inputTokens,
        outputTokens: call.usage.outputTokens,
        costUsd: call.usage.costUsd,
        durationMs,
        status: 'persist_error',
        errorMessage: errorMessage(err),
      });
      summary.failed += 1;
      continue;
    }

    await logScoreCall({
      artifactId: row.id,
      inputTokens: call.usage.inputTokens,
      outputTokens: call.usage.outputTokens,
      costUsd: call.usage.costUsd,
      durationMs,
      status: 'success',
    });
    summary.scored += 1;
  }

  summary.costUsd = Number(summary.costUsd.toFixed(6));
  return summary;
}

async function markFailed(artifactId: string): Promise<void> {
  await db
    .update(artifacts)
    .set({ status: 'score_failed', updatedAt: new Date().toISOString() })
    .where(eq(artifacts.id, artifactId));
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
  } catch {
    // Intentionally swallowed: the log is observability, not correctness.
  }
}
