/**
 * Shared persistence for a single scoring result, used by BOTH the synchronous scorer
 * (lib/scoring/score-artifacts.ts) and the batch ingester (lib/scoring/batch-score.ts) so
 * the two paths write identically. Writes only the ai_* proposal columns + evidence panel +
 * artifact taxonomy/status; the human_* / value columns are never touched (human-in-the-loop).
 *
 * The taxonomy LOCK (migration 0010) is honoured here: the source category fixes which fields
 * are authoritative from the source (source_prior, never overwritten) vs. which the scorer may
 * set (ai_proposed). A locked field is omitted from the artifact update so its source_prior stands.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { artifacts, evidencePanels, scores, scoringEvents } from '../db/schema';
import { AXIS_KEYS, type ScoringResult } from './rubric';

/** Drizzle transaction handle (same query surface as `db`). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** numeric(3,2) column → string, or null for an unscoreable axis. */
export function toNumericString(value: number | null): string | null {
  return value === null ? null : clamp01(value).toFixed(2);
}

interface TaxonomyUpdate {
  authorshipClass?: string;
  authorshipClassProvenance?: string;
  aiMediation?: string;
  aiMediationProvenance?: string;
  originAmbiguity?: string;
  originAmbiguityProvenance?: string;
}

/** Which taxonomy fields the scorer may set, given the source category's ground-truth lock. */
export function taxonomyUpdateFor(
  sourceCategory: string | null,
  result: ScoringResult
): TaxonomyUpdate {
  const isGenai = sourceCategory === 'genai_open_api' || sourceCategory === 'genai_curated_upload';
  const isInstitutional =
    sourceCategory === 'state_media_rss' || sourceCategory === 'cultural_institution';
  const update: TaxonomyUpdate = {};
  if (!isInstitutional) {
    update.authorshipClass = result.authorship_class;
    update.authorshipClassProvenance = 'ai_proposed';
  }
  if (!isGenai && !isInstitutional) {
    update.aiMediation = result.ai_mediation;
    update.aiMediationProvenance = 'ai_proposed';
  }
  update.originAmbiguity = result.origin_ambiguity;
  update.originAmbiguityProvenance = 'ai_proposed';
  return update;
}

export interface PersistArgs {
  tx: Tx;
  artifactId: string;
  sourceCategory: string | null;
  result: ScoringResult;
  model: string;
  promptVersion: string;
  proposedAt?: string;
}

/**
 * Persist one validated scoring result inside the caller's transaction: six axis proposals
 * (+ scoring_events), the evidence panel, and the artifact's alt text / dissertation flag /
 * taxonomy, finally flipping status to 'scored'.
 */
export async function persistScoringResult(args: PersistArgs): Promise<void> {
  const { tx, artifactId, sourceCategory, result, model, promptVersion } = args;
  const proposedAt = args.proposedAt ?? new Date().toISOString();
  const taxonomyUpdate = taxonomyUpdateFor(sourceCategory, result);

  for (const axis of AXIS_KEYS) {
    const axisResult = result.scores[axis];
    const proposed = toNumericString(axisResult.value);
    await tx
      .insert(scores)
      .values({
        artifactId,
        axis,
        aiProposedValue: proposed,
        aiReasoning: axisResult.reasoning,
        aiModel: model,
        aiProposedAt: proposedAt,
        scoringPromptVersion: promptVersion,
        updatedAt: proposedAt,
      })
      .onConflictDoUpdate({
        target: [scores.artifactId, scores.axis],
        // Only the ai_* proposal columns are touched; value and human_* are left as-is.
        set: {
          aiProposedValue: proposed,
          aiReasoning: axisResult.reasoning,
          aiModel: model,
          aiProposedAt: proposedAt,
          scoringPromptVersion: promptVersion,
          updatedAt: proposedAt,
        },
      });

    await tx.insert(scoringEvents).values({
      artifactId,
      axis,
      eventType: 'ai_proposed',
      newValue: proposed,
      reasoning: axisResult.reasoning,
    });
  }

  await tx
    .insert(evidencePanels)
    .values({ artifactId, paglenQuestions: result.paglen_questions, updatedAt: proposedAt })
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
    .where(eq(artifacts.id, artifactId));
}
