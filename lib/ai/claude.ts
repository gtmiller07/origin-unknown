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
  const res = await getClient().messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: instruction }],
    tools: [SCORING_TOOL],
    tool_choice: { type: 'tool', name: SCORING_TOOL.name },
  });

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
