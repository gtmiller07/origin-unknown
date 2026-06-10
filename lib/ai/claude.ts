/**
 * Anthropic client wrapper for scoring. Lazily initialised so importing the
 * module never requires ANTHROPIC_API_KEY until a score is requested, mirroring
 * the OpenAI embeddings wrapper. One scoring call is the theoretical system
 * prompt plus a per-artifact instruction, with output forced through the single
 * record_scores tool.
 */
import Anthropic from '@anthropic-ai/sdk';
import { SCORING_TOOL } from '../scoring/rubric';

/** Opus by default for maximum scoring rigor; overridable for evaluation runs. */
export const SCORING_MODEL = process.env.ANTHROPIC_SCORING_MODEL ?? 'claude-opus-4-7';

/** Pricing for claude-opus-4-7: $5 / 1M input tokens, $25 / 1M output tokens. */
export const USD_PER_INPUT_TOKEN = 5 / 1_000_000;
export const USD_PER_OUTPUT_TOKEN = 25 / 1_000_000;

const MAX_TOKENS = 4096;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  client ??= new Anthropic({ apiKey });
  return client;
}

export interface ScoreCallUsage {
  inputTokens: number;
  outputTokens: number;
  /** Billed cost in USD. */
  costUsd: number;
}

export interface ScoreCallResult {
  /** Raw tool input — unvalidated; the caller parses it against the zod schema. */
  toolInput: unknown;
  usage: ScoreCallUsage;
  model: string;
}

/**
 * The body of ONE scoring request: system prompt + per-artifact instruction, output forced
 * through the single record_scores tool. Shared by the synchronous path (messages.create)
 * and the batch path (one entry per artifact) so both send byte-identical requests.
 */
export function buildScoringParams(
  systemPrompt: string,
  instruction: string,
  model: string = SCORING_MODEL
) {
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: instruction }],
    tools: [SCORING_TOOL],
    tool_choice: { type: 'tool' as const, name: SCORING_TOOL.name },
  };
}

/**
 * Run one scoring call: the system prompt plus the per-artifact instruction,
 * with output forced through the single record_scores tool. Returns the raw
 * tool input and usage; validation and persistence are the caller's job so
 * spend is still recorded even when the payload fails to validate.
 */
export async function scoreArtifactContent(
  systemPrompt: string,
  instruction: string,
  model: string = SCORING_MODEL
): Promise<ScoreCallResult> {
  const res = await getClient().messages.create(buildScoringParams(systemPrompt, instruction, model));

  const toolUse = res.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Model response did not contain a tool_use block');
  }

  const { usage } = res;
  const costUsd =
    usage.input_tokens * USD_PER_INPUT_TOKEN + usage.output_tokens * USD_PER_OUTPUT_TOKEN;

  return {
    toolInput: toolUse.input,
    usage: {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costUsd,
    },
    model,
  };
}

// ─── Message Batches (bulk scoring at ~50% cost) ─────────────────────────────
// SDK 0.32.1 exposes batches under the beta namespace; the SDK auto-injects the
// `message-batches-2024-09-24` beta header. Types are derived from the client so we
// avoid fragile deep-import paths (the package's exports map blocks them).

/** Batch requests bill at 50% of standard rates. */
export const BATCH_DISCOUNT = 0.5;
export const BATCH_USD_PER_INPUT_TOKEN = USD_PER_INPUT_TOKEN * BATCH_DISCOUNT;
export const BATCH_USD_PER_OUTPUT_TOKEN = USD_PER_OUTPUT_TOKEN * BATCH_DISCOUNT;

type BatchesResource = Anthropic['beta']['messages']['batches'];
export type ScoringBatch = Awaited<ReturnType<BatchesResource['create']>>;
type BatchCreateArg = Parameters<BatchesResource['create']>[0];
type ResultsStream = Awaited<ReturnType<BatchesResource['results']>>;
export type BatchResultEntry = ResultsStream extends AsyncIterable<infer U> ? U : never;

export interface ScoringBatchRequest {
  /** Use the artifact UUID so results map back by custom_id. */
  custom_id: string;
  params: ReturnType<typeof buildScoringParams>;
}

/** Submit a batch of scoring requests. Returns the batch object (id, processing_status, ...). */
export async function submitScoringBatch(requests: ScoringBatchRequest[]): Promise<ScoringBatch> {
  // Our params are structurally identical to the beta Messages params (same model/system/
  // messages/tools/tool_choice); cast at the boundary since the runtime payload matches.
  return getClient().beta.messages.batches.create({ requests } as unknown as BatchCreateArg);
}

/** Poll a batch. processing_status is 'in_progress' | 'canceling' | 'ended'. */
export async function retrieveScoringBatch(batchId: string): Promise<ScoringBatch> {
  return getClient().beta.messages.batches.retrieve(batchId);
}

/** Stream a completed batch's per-request results (async-iterable JSONL). */
export async function streamScoringBatchResults(batchId: string): Promise<ResultsStream> {
  return getClient().beta.messages.batches.results(batchId);
}
