/**
 * Anthropic Haiku wrapper for the relevance gate's triage classifier. Mirrors
 * lib/ai/claude.ts (lazy client, one forced tool, usage + cost returned for the
 * caller to log) but targets the cheap claude-haiku-4-5 model and a
 * flat-primitive record_relevance tool.
 *
 * Haiku 4.5 does NOT support adaptive thinking or the effort parameter — both
 * return a 400 — so this is a plain messages.create with tool_choice, no
 * thinking/effort/output_config. Opus scoring (claude.ts) is where the heavier
 * reasoning machinery lives; triage is a fast, cheap, recall-biased filter.
 */
import Anthropic from '@anthropic-ai/sdk';

/** Haiku by default for cheap recall-biased triage; overridable for evaluation. */
export const TRIAGE_MODEL = process.env.ANTHROPIC_TRIAGE_MODEL ?? 'claude-haiku-4-5';

/** Pricing for claude-haiku-4-5: $1 / 1M input tokens, $5 / 1M output tokens. */
export const HAIKU_USD_PER_INPUT_TOKEN = 1 / 1_000_000;
export const HAIKU_USD_PER_OUTPUT_TOKEN = 5 / 1_000_000;

const MAX_TOKENS = 1024;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  client ??= new Anthropic({ apiKey });
  return client;
}

/**
 * The single forced tool for the relevance gate. Flat primitives only (boolean,
 * number, string) for the SAME reason the scoring tool is flattened: a nested
 * object/array field intermittently trips Anthropic's forced-tool-use
 * serialization quirk (returned double-encoded as a JSON string, or restructured
 * as an array). A primitive top-level field structurally cannot be stringified or
 * arrayed, so the quirk cannot occur here and no coercion pass is needed.
 */
export const RELEVANCE_TOOL: Anthropic.Tool = {
  name: 'record_relevance',
  description:
    'Record the two-axis relevance verdict for this artifact: Judgment A (cultural storytelling) and Judgment B (AI mediation / origin ambiguity), each with a calibrated confidence, plus the keep decision (true if EITHER judgment is relevant) and a one-sentence signal.',
  input_schema: {
    type: 'object',
    properties: {
      cultural_relevant: {
        type: 'boolean',
        description:
          'Judgment A. True if the SUBJECT or FORM is cultural or creative storytelling (art, music, film/video as creative work, performance, literature, design, craft, heritage, festival, religious/folk tradition — or reporting specifically ABOUT such cultural production or its circulation). False for straight news about events, commerce, ads, or spam.',
      },
      cultural_confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description:
          'Confidence in Judgment A, 0.00 to 1.00. This is a knob the gate tunes: a not-relevant verdict only contributes to a drop when this confidence clears the exclusion threshold, so report genuine certainty rather than a default.',
      },
      ai_or_ambiguous: {
        type: 'boolean',
        description:
          'Judgment B. True if the artifact is AI-generated or AI-assisted creative work, OR its authorship/origin is genuinely ambiguous (you cannot tell who or what made it, or where it came from). Stands on its own — credit it even when Judgment A is not cleanly met.',
      },
      ai_confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description:
          'Confidence in Judgment B, 0.00 to 1.00. The gate tunes this too: dropping a genuine AI-mediated or origin-ambiguous artifact is the most damaging error, so report honest certainty rather than rounding toward a verdict.',
      },
      keep: {
        type: 'boolean',
        description:
          'True if EITHER judgment is relevant above its bar. Your own recall-biased keep call; the gate also recomputes keep from the two confidences at its tuned threshold.',
      },
      signal: {
        type: 'string',
        description:
          'One sentence naming the specific cue behind your decision, stating which judgment (A or B) drove the keep-or-drop.',
      },
    },
    required: [
      'cultural_relevant',
      'cultural_confidence',
      'ai_or_ambiguous',
      'ai_confidence',
      'keep',
      'signal',
    ],
  },
};

export interface TriageCallUsage {
  inputTokens: number;
  outputTokens: number;
  /** Billed cost in USD. */
  costUsd: number;
}

export interface TriageCallResult {
  /** Raw tool input — unvalidated; the caller parses it against the zod schema. */
  toolInput: unknown;
  usage: TriageCallUsage;
  model: string;
}

/**
 * Run one relevance-triage call: the gate system prompt plus a per-artifact
 * instruction, forced through the single record_relevance tool. Returns the raw
 * tool input and usage; validation and persistence are the caller's job so spend
 * is still recorded even when the payload fails to validate (mirrors
 * scoreArtifactContent).
 */
export async function classifyRelevance(
  systemPrompt: string,
  instruction: string,
  model: string = TRIAGE_MODEL
): Promise<TriageCallResult> {
  const res = await getClient().messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: instruction }],
    tools: [RELEVANCE_TOOL],
    tool_choice: { type: 'tool', name: RELEVANCE_TOOL.name },
  });

  const toolUse = res.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Model response did not contain a tool_use block');
  }

  const { usage } = res;
  const costUsd =
    usage.input_tokens * HAIKU_USD_PER_INPUT_TOKEN +
    usage.output_tokens * HAIKU_USD_PER_OUTPUT_TOKEN;

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
