/**
 * Anthropic client wrapper for scoring. Lazily initialised so importing the
 * module never requires ANTHROPIC_API_KEY until a score is requested, mirroring
 * the OpenAI embeddings wrapper. Uses the prompt-caching beta endpoint so the
 * large theoretical system prompt is cached across a scoring batch; the SDK
 * attaches the prompt-caching beta header automatically.
 */
import Anthropic from '@anthropic-ai/sdk';
import { SCORING_TOOL } from '../scoring/rubric';

/** Opus by default for maximum scoring rigor; overridable for evaluation runs. */
export const SCORING_MODEL = process.env.ANTHROPIC_SCORING_MODEL ?? 'claude-opus-4-8';

/** Pricing for claude-opus-4-8: $5 / 1M input tokens, $25 / 1M output tokens. */
export const USD_PER_INPUT_TOKEN = 5 / 1_000_000;
export const USD_PER_OUTPUT_TOKEN = 25 / 1_000_000;
/** Cache writes bill at 1.25x base input; cache reads at 0.10x. */
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

const MAX_TOKENS = 4096;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  client ??= new Anthropic({ apiKey });
  return client;
}

export interface ScoreCallUsage {
  /** Total prompt input tokens (uncached + cache write + cache read). */
  inputTokens: number;
  outputTokens: number;
  /** Billed cost in USD, accounting for the cache write/read multipliers. */
  costUsd: number;
}

export interface ScoreCallResult {
  /** Raw tool input — unvalidated; the caller parses it against the zod schema. */
  toolInput: unknown;
  usage: ScoreCallUsage;
  model: string;
}

/**
 * Run one scoring call: the cached system prompt plus the per-artifact
 * instruction, with output forced through the single record_scores tool. Returns
 * the raw tool input and usage; validation and persistence are the caller's job
 * so spend is still recorded even when the payload fails to validate.
 */
export async function scoreArtifactContent(
  systemPrompt: string,
  instruction: string,
  model: string = SCORING_MODEL
): Promise<ScoreCallResult> {
  const res = await getClient().beta.promptCaching.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: instruction }],
    tools: [SCORING_TOOL],
    tool_choice: { type: 'tool', name: SCORING_TOOL.name },
  });

  const toolUse = res.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Model response did not contain a tool_use block');
  }

  const { usage } = res;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const costUsd =
    usage.input_tokens * USD_PER_INPUT_TOKEN +
    cacheWrite * USD_PER_INPUT_TOKEN * CACHE_WRITE_MULTIPLIER +
    cacheRead * USD_PER_INPUT_TOKEN * CACHE_READ_MULTIPLIER +
    usage.output_tokens * USD_PER_OUTPUT_TOKEN;

  return {
    toolInput: toolUse.input,
    usage: {
      inputTokens: usage.input_tokens + cacheWrite + cacheRead,
      outputTokens: usage.output_tokens,
      costUsd,
    },
    model,
  };
}
