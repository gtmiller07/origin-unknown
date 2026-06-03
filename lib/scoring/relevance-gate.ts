/**
 * The relevance gate (methodology redesign, step 2). It decides WHICH pending,
 * embedded artifacts are eligible for expensive Opus six-axis scoring, writing the
 * decision into the gate_* columns added by migration 0012 — ORTHOGONAL to
 * artifacts.status (a triage/sampling decision is research data, not a point in the
 * scoring lifecycle). NULL gate_decision = not yet gated.
 *
 * The corpus is an INCUMBENT-vs-CHALLENGER comparison, so the gate segments by the
 * step-1 authorship taxonomy (ai_mediation, set as a source_prior by migration
 * 0010) into three mutually exclusive, collectively exhaustive buckets:
 *
 *   1. CHALLENGER  (ai_mediation ∈ {ai_generated, ai_assisted}) — in scope by
 *      definition; bulk-included with gate_method 'taxonomy_prior'. (No API cost.)
 *   2. INCUMBENT BASELINE (ai_mediation = 'human_made') — kept to a stratified,
 *      deterministic per-source RANDOM sample; included rows 'include', the rest
 *      'exclude', gate_method 'baseline_sample'. (No API cost.)
 *   3. AMBIGUOUS (ai_mediation = 'unknown' OR NULL — the open social / UGC
 *      platforms) — the only bucket that costs anything: a recall-biased Haiku
 *      classifier decides, gate_method 'haiku_triage'.
 *
 * The calibration finding that drove this design: cosine-similarity-to-the-question
 * does NOT separate relevant from irrelevant (known-relevant artifacts sit at the
 * corpus-mean similarity), so similarity is DEMOTED to a stored feature
 * (question_similarity, computeQuestionSimilarity below) and is never a cutoff.
 *
 * Every selection predicate includes `status='pending' AND embedding IS NOT NULL
 * AND gate_decision IS NULL`, so all three passes are idempotent and resumable: a
 * re-run only touches artifacts not yet gated.
 */
import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { EMBEDDING_USD_PER_TOKEN, embedTexts } from '../ai/embeddings';
import { classifyRelevance } from '../ai/haiku';
import { isCapped } from '../cost/caps';
import { db } from '../db/client';
import { apiCallLog, artifacts, sources } from '../db/schema';
import {
  type ArtifactForScoring,
  type ArtifactSourceContext,
  artifactMetadata,
  sourceContext,
} from './render';

/**
 * The dissertation question, mirrored verbatim from the active scoring prompt
 * (migration 0011, scoring_prompts v1.1) so the gate and the scorer speak about
 * the same target. Also the text embedded for the question_similarity feature.
 */
export const DISSERTATION_QUESTION =
  'When the technical floor of cultural production drops to zero and origin becomes ambiguous, what determines which content travels diplomatically, and by what method could we know it as it happens?';

/**
 * Recall-biased exclusion threshold for the Haiku triage: a not-relevant verdict
 * only EXCLUDES when its confidence is >= this value, so a low-confidence
 * not-relevant is kept for the (more capable, more expensive) Opus scorer to
 * adjudicate. This default is a starting point; scripts/gate-calibrate.ts tunes it
 * against the hand-labeled relevance_calibration set and the runner passes the
 * tuned value in.
 */
export const DEFAULT_EXCLUDE_THRESHOLD = 0.7;

/** Per-source cap for the stratified incumbent-baseline sample. */
export const DEFAULT_BASELINE_CAP_PER_SOURCE = 50;

/** Ambiguous artifacts triaged per batch; the runner loops until none remain. */
export const DEFAULT_TRIAGE_LIMIT = 50;

/**
 * The flat-primitive shape Haiku fills via the record_relevance tool — the two-axis
 * verdict: Judgment A (cultural storytelling) and Judgment B (AI mediation / origin
 * ambiguity), each a boolean + confidence, plus the model's own `keep` call and a
 * one-sentence `signal`. Confidences are lenient on range here (the tool schema
 * steers them into [0, 1] and persistence clamps) but strict that they are numbers.
 * Keys are snake_case to match the tool's JSON output verbatim. No array/object
 * fields, so the forced-tool serialization quirk cannot occur and no coercion pass
 * is needed.
 */
export const RelevanceResultSchema = z.object({
  cultural_relevant: z.boolean(),
  cultural_confidence: z.number(),
  ai_or_ambiguous: z.boolean(),
  ai_confidence: z.number(),
  keep: z.boolean(),
  signal: z.string().min(1),
});

export type RelevanceResult = z.infer<typeof RelevanceResultSchema>;

/** Normalized two-axis verdict (camelCase), decoupled from the tool's snake_case. */
export interface GateVerdict {
  culturalRelevant: boolean;
  culturalConfidence: number;
  aiOrAmbiguous: boolean;
  aiConfidence: number;
}

/**
 * The gate's recall-biased keep-or-drop rule, now over TWO independent judgments
 * kept on EITHER: cultural storytelling (A) OR AI-mediation/origin-ambiguity (B).
 * Each axis is recall-biased on its own — a not-relevant verdict only contributes
 * to a drop when its confidence clears the threshold — so an artifact is dropped
 * ONLY when both axes are not-relevant AND both confidences clear it. Judgment B
 * therefore vetoes dropping the AI/ambiguous bullseye. A false exclusion is
 * permanent (the artifact leaves the corpus silently); a false inclusion is cheap
 * (the downstream scorer catches it). recall is still monotonic in the threshold,
 * so the calibration recommendation (smallest threshold clearing the recall target)
 * is unchanged.
 */
export function decideInclusion(d: GateVerdict, excludeThreshold: number): boolean {
  const keepCultural = d.culturalRelevant || d.culturalConfidence < excludeThreshold;
  const keepAi = d.aiOrAmbiguous || d.aiConfidence < excludeThreshold;
  return keepCultural || keepAi;
}

/**
 * Collapse the two-axis verdict to the single governing confidence stored in
 * artifacts.gate_confidence (the per-axis values are stored alongside it). On a
 * keep, the strongest conviction (max) characterizes why we kept it; on a drop, the
 * weaker rejection (min) is the binding constraint — the axis nearest the threshold,
 * the honest measure of how close the artifact came to being kept.
 */
export function summarizeGateConfidence(d: GateVerdict, keep: boolean): number {
  return keep
    ? Math.max(d.culturalConfidence, d.aiConfidence)
    : Math.min(d.culturalConfidence, d.aiConfidence);
}

/**
 * The system prompt for the two-axis recall-biased relevance triage. Judgment A
 * (cultural storytelling) and Judgment B (AI mediation / origin ambiguity) are made
 * independently and the artifact is kept on EITHER. The prompt must match the human
 * keep/drop criterion the threshold is calibrated against — a broader prompt would
 * make the gate exclude almost nothing and invalidate the calibration.
 */
export const RELEVANCE_SYSTEM_PROMPT = `You are a relevance-triage classifier for a scholarly research corpus on AI-mediated cultural diplomacy. Your only job is a fast keep-or-drop decision; the deep six-axis scoring happens later, by a more capable model, only on the artifacts you keep.

The dissertation question: "${DISSERTATION_QUESTION}"

The corpus studies how cultural storytelling travels across borders and, especially, how AI-generated or AI-assisted creative work is reshaping who gets to tell those stories and whether their origin can still be known. Your mission is to separate content relevant to AI-mediated cultural storytelling and its circulation from the news, commercial, and spam flood around it. The artifacts you triage come from open social and user-generated platforms, which often contain a high volume of routine news.

You are making TWO independent judgments, and an artifact is kept if EITHER one clears its bar.

JUDGMENT A — Cultural storytelling.
RELEVANT when the SUBJECT or FORM is cultural or creative storytelling: art, music, film or video as creative work, animation, literature, performance, dance, design, fashion, games, photography, craft, cuisine, heritage, festivals, religious or folk tradition — or reporting/commentary specifically ABOUT such cultural production or its circulation.
NOT relevant when it is straight news or commentary about events rather than culture: politics, elections, war and military action, diplomacy and geopolitics, crime and accidents, business, markets, finance, technology products, sports results, weather. These are not relevant even when they cross national boundaries or involve multiple countries. Also not relevant: advertising, promotion, spam, engagement-bait, and empty or broken records.

JUDGMENT B — AI mediation and origin ambiguity.
RELEVANT when the artifact is AI-generated or AI-assisted creative work, OR when its authorship or origin is genuinely ambiguous (you cannot tell who made it, where it came from, or whether a human or a machine produced it). This judgment stands on its own. An AI-generated or origin-ambiguous creative artifact is the bullseye of this corpus and should be KEPT even when the cultural-storytelling test in Judgment A is not cleanly met — for example a synthesized melody, an uncaptioned generated video, or an ambiguous image posted without context. Do not require an artifact to look obviously "cultural" before you credit its AI or ambiguity signal.

THE BOUNDARY CASE TO GET RIGHT.
A NEWS REPORT about a cultural subject (a film festival, a music phenomenon, an AI-art controversy, a heritage-site dispute) IS relevant under Judgment A. A merely cultural-sounding FRAME on a hard-news event (e.g. "the story of" a battle, a "cultural moment" framing of an election) is NOT relevant under Judgment A — judge by the actual subject, not the rhetoric.
BUT: if the FORM is AI-generated or AI-assisted creative work, the artifact is KEPT under Judgment B even when its SUBJECT is a hard-news event. An AI-generated folk-style retelling, meme, synthetic ballad, or animated recap of a war or an election is itself part of the phenomenon under study — the cultural repackaging of hard news through AI is exactly what this corpus exists to capture. Do not drop it as a "cultural frame on hard news."

RECALL BIAS ON BOTH AXES.
When you are genuinely unsure whether something is cultural storytelling, lean keep. When you are genuinely unsure whether something is AI-mediated or origin-ambiguous, lean keep. A false keep costs a few cents of later scoring; a false drop removes an artifact the instrument can never see again, and dropping a genuine AI-mediated or origin-ambiguous artifact is the most damaging error you can make. Reserve a confident drop for items you are sure are non-cultural news, commercial, or spam AND that carry no AI-mediation or ambiguity signal.

CONFIDENCE IS THE KNOB.
Your confidence is what the gate tunes against human-labeled ground truth. A drop only excludes an artifact when its confidence clears the exclusion threshold, so report honest certainty rather than rounding toward a verdict.

Call record_relevance with:
- cultural_relevant: boolean (Judgment A)
- cultural_confidence: number in [0.00, 1.00]
- ai_or_ambiguous: boolean (Judgment B)
- ai_confidence: number in [0.00, 1.00]
- keep: boolean — true if EITHER judgment is relevant above its bar
- signal: one sentence naming the specific cue behind your decision, stating which judgment drove the keep-or-drop.`;

/** The artifact + source columns the triage selects and the instruction renders. */
export interface TriageRow {
  id: string;
  title: string | null;
  description: string | null;
  contentUrl: string | null;
  thumbnailUrl: string | null;
  mediaType: string | null;
  languageCodes: string[] | null;
  originCountryCodes: string[] | null;
  publishedAt: string | null;
  isAiGenerated: boolean | null;
  aiGenerationMetadata: unknown;
  externalId: string;
  sourceName: string | null;
  sourceCategory: string | null;
  sourceNotes: string | null;
}

/** The select projection shared by the triage batch and the calibration script. */
const TRIAGE_SELECT = {
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
} as const;

/**
 * Render the triage instruction from a row, reusing the scorer's metadata and
 * source-context blocks so the triage sees exactly the textual evidence the
 * scorer will (minus the thumbnail block, which carries no real signal without a
 * vision description). Exported so the calibration script builds an identical
 * instruction — the threshold is only valid if calibration and production agree.
 */
export function buildTriageInstruction(row: TriageRow): string {
  const forScoring: ArtifactForScoring = {
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
  const ctx: ArtifactSourceContext = {
    sourceName: row.sourceName,
    sourceCategory: row.sourceCategory,
    sourceNotes: row.sourceNotes,
  };
  return [
    'Decide whether the artifact below is relevant to the dissertation question.',
    artifactMetadata(forScoring),
    sourceContext(ctx),
  ].join('\n\n');
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** numeric(3,2) column → clamped, 2-dp string. */
function toNumericString(value: number): string {
  return clamp01(value).toFixed(2);
}

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}

// ── Pass 1: challengers ──────────────────────────────────────────────────────

/**
 * Bulk-include the challenger class (ai_generated / ai_assisted). In scope by
 * definition under the incumbent-vs-challenger design, so no per-artifact judgment
 * and no API cost. Idempotent: only ungated, pending, embedded rows are touched.
 */
export async function gateChallengers(): Promise<{ included: number }> {
  const nowIso = new Date().toISOString();
  const rows = await db
    .update(artifacts)
    .set({
      gateDecision: 'include',
      gateMethod: 'taxonomy_prior',
      gateConfidence: '1.00',
      gateReasoning:
        'Challenger class (AI-generated or AI-assisted): in scope by definition under the incumbent-vs-challenger design.',
      gatedAt: nowIso,
      updatedAt: nowIso,
    })
    .where(
      and(
        eq(artifacts.status, 'pending'),
        isNotNull(artifacts.embedding),
        isNull(artifacts.gateDecision),
        inArray(artifacts.aiMediation, ['ai_generated', 'ai_assisted'])
      )
    )
    .returning({ id: artifacts.id });
  return { included: rows.length };
}

// ── Pass 2: incumbent baseline ───────────────────────────────────────────────

/**
 * Keep the incumbent baseline (human_made) to a stratified per-source sample.
 * Ordering is by md5(id) — a DETERMINISTIC pseudo-random, so the sample is
 * reproducible across re-runs (research data, not a coin flip). Within each
 * source the first `capPerSource` rows are 'include', the rest 'exclude'; both
 * decisions are persisted, so this bucket fully resolves in one pass and the
 * exclusions are themselves recorded research data.
 */
export async function gateBaselineSample(
  opts: { capPerSource?: number } = {}
): Promise<{ included: number; excluded: number; capPerSource: number }> {
  const capPerSource = Math.max(
    1,
    Math.floor(opts.capPerSource ?? DEFAULT_BASELINE_CAP_PER_SOURCE)
  );
  const result = await db.execute(sql`
    WITH ranked AS (
      SELECT id,
             row_number() OVER (
               PARTITION BY source_id ORDER BY md5(id::text)
             ) AS rn
      FROM artifacts
      WHERE status = 'pending'
        AND embedding IS NOT NULL
        AND gate_decision IS NULL
        AND ai_mediation = 'human_made'
    )
    UPDATE artifacts a
    SET gate_decision = CASE WHEN r.rn <= ${capPerSource} THEN 'include' ELSE 'exclude' END,
        gate_method = 'baseline_sample',
        gate_confidence = 1.00,
        gate_reasoning = CASE
          WHEN r.rn <= ${capPerSource}
          THEN 'Incumbent baseline: kept in the stratified per-source random sample (rank ' || r.rn || ' of cap ' || ${capPerSource} || ').'
          ELSE 'Incumbent baseline: outside the stratified per-source random sample cap (rank ' || r.rn || ' > ' || ${capPerSource} || ').'
        END,
        gated_at = now(),
        updated_at = now()
    FROM ranked r
    WHERE a.id = r.id
    RETURNING a.gate_decision AS decision
  `);
  let included = 0;
  let excluded = 0;
  for (const row of result as unknown as Array<{ decision: string }>) {
    if (row.decision === 'include') included += 1;
    else excluded += 1;
  }
  return { included, excluded, capPerSource };
}

// ── Pass 3: ambiguous Haiku triage ───────────────────────────────────────────

export interface TriageBatchSummary {
  scanned: number;
  included: number;
  excluded: number;
  failed: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  costUsd: number;
  /** True if the run halted early on the anthropic/aggregate cost cap. */
  capped: boolean;
  errors: string[];
}

/**
 * Triage one batch of the ambiguous bucket (ai_mediation 'unknown' or NULL) with
 * Haiku. Mirrors scorePendingArtifacts: cost-capped per artifact, bounded retry,
 * every returned call billed and logged even on terminal failure. A failed triage
 * leaves gate_decision NULL (so the next run retries it) rather than guessing a
 * decision — recall-biased and resumable. The runner loops this until scanned is
 * 0 or the cap trips.
 */
export async function classifyAmbiguousBatch(
  opts: { limit?: number; excludeThreshold?: number; maxAttempts?: number } = {}
): Promise<TriageBatchSummary> {
  const limit = opts.limit ?? DEFAULT_TRIAGE_LIMIT;
  const excludeThreshold = opts.excludeThreshold ?? DEFAULT_EXCLUDE_THRESHOLD;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 1);

  const summary: TriageBatchSummary = {
    scanned: 0,
    included: 0,
    excluded: 0,
    failed: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    costUsd: 0,
    capped: false,
    errors: [],
  };

  const pending = await db
    .select(TRIAGE_SELECT)
    .from(artifacts)
    .leftJoin(sources, eq(artifacts.sourceId, sources.id))
    .where(
      and(
        eq(artifacts.status, 'pending'),
        isNotNull(artifacts.embedding),
        isNull(artifacts.gateDecision),
        or(eq(artifacts.aiMediation, 'unknown'), isNull(artifacts.aiMediation))
      )
    )
    .limit(limit);

  summary.scanned = pending.length;

  for (const row of pending) {
    if (await isCapped('anthropic')) {
      summary.capped = true;
      break;
    }

    const instruction = buildTriageInstruction(row);

    const startedAt = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    let costUsd = 0;
    let model = '';
    let decision: RelevanceResult | null = null;
    let parseError: string | null = null;
    let transportError: string | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let call: Awaited<ReturnType<typeof classifyRelevance>>;
      try {
        call = await classifyRelevance(RELEVANCE_SYSTEM_PROMPT, instruction);
      } catch (err) {
        transportError = `api_call: ${errorMessage(err)}`;
        if (attempt < maxAttempts) {
          console.warn(
            `triage: transport error on ${row.id} (attempt ${attempt}/${maxAttempts}), retrying`
          );
        }
        continue;
      }

      inputTokens += call.usage.inputTokens;
      outputTokens += call.usage.outputTokens;
      costUsd += call.usage.costUsd;
      model = call.model;
      transportError = null;

      const parsed = RelevanceResultSchema.safeParse(call.toolInput);
      if (parsed.success) {
        decision = parsed.data;
        parseError = null;
        break;
      }
      parseError = `parse_error: ${parsed.error.message.slice(0, 480)}`;
      if (attempt < maxAttempts) {
        console.warn(
          `triage: malformed tool output on ${row.id} (attempt ${attempt}/${maxAttempts}), retrying`
        );
      }
    }
    const durationMs = Date.now() - startedAt;

    summary.totalInputTokens += inputTokens;
    summary.totalOutputTokens += outputTokens;
    summary.costUsd += costUsd;

    if (!decision) {
      // No valid verdict. Log whatever was billed and leave gate_decision NULL so
      // the next run retries this artifact (the gate has no 'failed' decision —
      // its CHECK is include/exclude — and silently excluding would break the
      // recall bias). Surfaced in errors either way.
      const message = parseError ?? transportError ?? 'triage failed';
      await logTriageCall({
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

    const verdict: GateVerdict = {
      culturalRelevant: decision.cultural_relevant,
      culturalConfidence: decision.cultural_confidence,
      aiOrAmbiguous: decision.ai_or_ambiguous,
      aiConfidence: decision.ai_confidence,
    };
    const include = decideInclusion(verdict, excludeThreshold);
    const nowIso = new Date().toISOString();

    try {
      await db
        .update(artifacts)
        .set({
          gateDecision: include ? 'include' : 'exclude',
          gateMethod: 'haiku_triage',
          gateReasoning: decision.signal,
          gateConfidence: toNumericString(summarizeGateConfidence(verdict, include)),
          gateCulturalRelevant: decision.cultural_relevant,
          gateCulturalConfidence: toNumericString(decision.cultural_confidence),
          gateAiOrAmbiguous: decision.ai_or_ambiguous,
          gateAiConfidence: toNumericString(decision.ai_confidence),
          gateModel: model,
          gatedAt: nowIso,
          updatedAt: nowIso,
        })
        .where(eq(artifacts.id, row.id));
    } catch (err) {
      const message = `persist_error: ${errorMessage(err)}`;
      await logTriageCall({
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

    await logTriageCall({
      artifactId: row.id,
      inputTokens,
      outputTokens,
      costUsd,
      durationMs,
      status: 'success',
    });
    if (include) summary.included += 1;
    else summary.excluded += 1;
  }

  summary.costUsd = Number(summary.costUsd.toFixed(6));
  return summary;
}

// ── Demoted similarity feature ───────────────────────────────────────────────

/**
 * Compute and store question_similarity = 1 - cosine_distance(embedding, qvec)
 * for every embedded artifact that doesn't have it yet. This is a STORED FEATURE
 * for analysis only — the calibration finding showed similarity does not separate
 * relevant from irrelevant, so it is NEVER a gate cutoff. One embedding call for
 * the question, then a single bulk UPDATE. Idempotent on question_similarity IS NULL.
 */
export async function computeQuestionSimilarity(): Promise<{
  updated: number;
  costUsd: number;
}> {
  const { embeddings, totalTokens } = await embedTexts([DISSERTATION_QUESTION]);
  const qvec = embeddings[0];
  if (!qvec) throw new Error('Failed to embed the dissertation question');
  if (!qvec.every((n) => Number.isFinite(n))) {
    throw new Error('Question embedding contains a non-finite value');
  }

  // Inline the query vector as a SQL literal parsed by pgvector's input function.
  // sql.raw (not a bound parameter) is deliberate: a bound TEXT parameter would
  // need a text->vector cast that pgvector does not define, whereas the
  // '[a,b,c]'::vector literal form is always accepted. Injection-safe — every
  // element is a finite number (guarded above), so the literal is only digits,
  // '.', '-', 'e', and ','.
  const vectorLiteral = `'[${qvec.join(',')}]'::vector`;
  const startedAt = Date.now();
  const result = await db.execute(sql`
    UPDATE artifacts
    SET question_similarity = 1 - (embedding <=> ${sql.raw(vectorLiteral)}),
        updated_at = now()
    WHERE embedding IS NOT NULL AND question_similarity IS NULL
    RETURNING id
  `);
  const durationMs = Date.now() - startedAt;
  const updated = (result as unknown as Array<unknown>).length;
  const costUsd = totalTokens * EMBEDDING_USD_PER_TOKEN;
  await logSimilarityCall(totalTokens, costUsd, durationMs);
  return { updated, costUsd: Number(costUsd.toFixed(6)) };
}

// ── Spend logging (observability; must never fail a run) ─────────────────────

interface TriageCallLog {
  artifactId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  status: string;
  errorMessage?: string;
  /** api_call_log operation tag; defaults to 'relevance_triage'. */
  operation?: string;
}

/**
 * Record relevance-classifier spend to api_call_log so the cost-cap breaker sees it.
 * Mirrors logScoreCall; never fails the run. Exported so the calibration scripts
 * (gate-label, gate-calibrate) log their spend too — otherwise the cap is blind to it.
 * operation defaults to 'relevance_triage'.
 */
export async function logTriageCall(entry: TriageCallLog): Promise<void> {
  try {
    await db.insert(apiCallLog).values({
      service: 'anthropic',
      operation: entry.operation ?? 'relevance_triage',
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
    console.error('logTriageCall: failed to write api_call_log row', err);
  }
}

/** Record the one question-embedding call. Observability only. */
async function logSimilarityCall(
  tokens: number,
  costUsd: number,
  durationMs: number
): Promise<void> {
  try {
    await db.insert(apiCallLog).values({
      service: 'openai',
      operation: 'relevance_similarity',
      inputTokens: tokens,
      costUsd: costUsd > 0 ? costUsd.toFixed(6) : null,
      durationMs,
      status: 'success',
    });
  } catch {
    // Intentionally swallowed: the log is observability, not correctness.
  }
}
