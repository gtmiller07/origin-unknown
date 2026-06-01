/**
 * The machine-readable half of the six-axis scoring contract. The system prompt
 * (the theoretical scaffolding that names these axes) lives in the DB as the
 * active scoring_prompts row; this module pins the axis keys, the zod schema the
 * model output is validated against, and the Anthropic tool that forces
 * structured output. AXIS_KEYS is the single source of truth — the zod schema,
 * the tool input schema, and persistence all derive from it.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

/** The six scoring axes, in canonical order. Stable wire contract — do not rename. */
export const AXIS_KEYS = [
  'origin',
  'reach',
  'aesthetic_signal',
  'diplomatic_cross_boundary',
  'diplomatic_authenticity',
  'diplomatic_reciprocity',
] as const;

export type AxisKey = (typeof AXIS_KEYS)[number];

/** Human-readable axis labels for UI and logging; keys mirror AXIS_KEYS exactly. */
export const AXIS_LABELS: Record<AxisKey, string> = {
  origin: 'Origin',
  reach: 'Reach',
  aesthetic_signal: 'Aesthetic signal',
  diplomatic_cross_boundary: 'Diplomatic cross-boundary',
  diplomatic_authenticity: 'Diplomatic authenticity',
  diplomatic_reciprocity: 'Diplomatic reciprocity',
};

/**
 * Authorship taxonomy value sets (migration 0010), shared by the zod schema and
 * the tool input schema so the wire contract has a single source of truth. These
 * are flat string enums: unlike a nested object or array, a primitive enum field
 * cannot be double-encoded or restructured by the forced-tool-use quirk.
 */
export const AUTHORSHIP_CLASSES = [
  'individual_creator',
  'community_collective',
  'commercial_institutional',
  'state_affiliated',
  'ambiguous_unattributable',
] as const;
export const AI_MEDIATIONS = ['human_made', 'ai_assisted', 'ai_generated', 'unknown'] as const;
export const ORIGIN_AMBIGUITIES = ['none', 'low', 'high'] as const;

/**
 * One axis result. `value` is lenient on range (the model is steered into
 * [0, 1] by the tool schema and the persistence layer clamps) but strict that a
 * score is either a number or an explicit null — never silently missing.
 */
export const AxisScoreSchema = z.object({
  value: z.number().nullable(),
  reasoning: z.string().min(1),
});

export type AxisScore = z.infer<typeof AxisScoreSchema>;

/**
 * The flat wire shape the model fills directly: `<axis>_value` and
 * `<axis>_reasoning` for each of the six axes. Flattening is deliberate. A nested
 * `scores` object is exactly the deeply-nested shape that intermittently trips
 * Anthropic's forced-tool-use serialization quirk — the field comes back
 * double-encoded as a JSON string, or restructured as an array, on ~20-33% of
 * calls. Primitive top-level fields cannot be stringified or arrayed, so the quirk
 * structurally cannot occur for the scores. We validate this flat shape, then
 * transform it back into the nested form the persistence layer already consumes.
 */
const FlatScoringSchema = z.object({
  origin_value: z.number().nullable(),
  origin_reasoning: z.string().min(1),
  reach_value: z.number().nullable(),
  reach_reasoning: z.string().min(1),
  aesthetic_signal_value: z.number().nullable(),
  aesthetic_signal_reasoning: z.string().min(1),
  diplomatic_cross_boundary_value: z.number().nullable(),
  diplomatic_cross_boundary_reasoning: z.string().min(1),
  diplomatic_authenticity_value: z.number().nullable(),
  diplomatic_authenticity_reasoning: z.string().min(1),
  diplomatic_reciprocity_value: z.number().nullable(),
  diplomatic_reciprocity_reasoning: z.string().min(1),
  paglen_questions: z.array(z.string().min(1)).min(1),
  alt_text: z.string().min(1),
  bears_on_dissertation_question: z.boolean(),
  dissertation_relevance: z.string(),
  authorship_class: z.enum(AUTHORSHIP_CLASSES),
  ai_mediation: z.enum(AI_MEDIATIONS),
  origin_ambiguity: z.enum(ORIGIN_AMBIGUITIES),
});

/**
 * The full structured result, validated after the forced tool call returns. The
 * flat wire shape is transformed back into the nested
 * `{ scores: { <axis>: { value, reasoning } } }` form so flattening the tool
 * contract touches nothing downstream (score-artifacts.ts still reads
 * `result.scores[axis]`).
 */
export const ScoringResultSchema = FlatScoringSchema.transform((f) => ({
  scores: {
    origin: { value: f.origin_value, reasoning: f.origin_reasoning },
    reach: { value: f.reach_value, reasoning: f.reach_reasoning },
    aesthetic_signal: {
      value: f.aesthetic_signal_value,
      reasoning: f.aesthetic_signal_reasoning,
    },
    diplomatic_cross_boundary: {
      value: f.diplomatic_cross_boundary_value,
      reasoning: f.diplomatic_cross_boundary_reasoning,
    },
    diplomatic_authenticity: {
      value: f.diplomatic_authenticity_value,
      reasoning: f.diplomatic_authenticity_reasoning,
    },
    diplomatic_reciprocity: {
      value: f.diplomatic_reciprocity_value,
      reasoning: f.diplomatic_reciprocity_reasoning,
    },
  } satisfies Record<AxisKey, AxisScore>,
  paglen_questions: f.paglen_questions,
  alt_text: f.alt_text,
  bears_on_dissertation_question: f.bears_on_dissertation_question,
  dissertation_relevance: f.dissertation_relevance,
  authorship_class: f.authorship_class,
  ai_mediation: f.ai_mediation,
  origin_ambiguity: f.origin_ambiguity,
}));

export type ScoringResult = z.infer<typeof ScoringResultSchema>;

/** JSON-schema fragments for one axis's two flat fields in the tool input. */
const axisValueSchema = {
  anyOf: [{ type: 'number', minimum: 0, maximum: 1 }, { type: 'null' }],
  description:
    'Score in [0.00, 1.00], or null if the axis cannot be scored from the available evidence.',
};
const axisReasoningSchema = {
  type: 'string',
  description:
    '50-to-150 words naming the specific evidence and inferential steps behind the score.',
};

// Twelve flat axis properties (`<axis>_value`, `<axis>_reasoning`) and their keys.
const flatAxisProperties: Record<string, unknown> = {};
const flatAxisRequired: string[] = [];
for (const key of AXIS_KEYS) {
  flatAxisProperties[`${key}_value`] = {
    ...axisValueSchema,
    description: `${AXIS_LABELS[key]} axis. ${axisValueSchema.description}`,
  };
  flatAxisProperties[`${key}_reasoning`] = {
    ...axisReasoningSchema,
    description: `${AXIS_LABELS[key]} axis. ${axisReasoningSchema.description}`,
  };
  flatAxisRequired.push(`${key}_value`, `${key}_reasoning`);
}

/**
 * The single forced tool. We never want free prose back: `tool_choice` pins this
 * tool so every response is a structured `record_scores` call we can validate.
 */
export const SCORING_TOOL: Anthropic.Tool = {
  name: 'record_scores',
  description:
    'Record the six-axis scores with per-axis reasoning, Paglen-style interrogative questions, accessibility alt text, and the dissertation-relevance judgment for a single artifact.',
  input_schema: {
    type: 'object',
    properties: {
      ...flatAxisProperties,
      paglen_questions: {
        type: 'array',
        items: { type: 'string' },
        minItems: 3,
        maxItems: 5,
        description:
          'Three to five open, Paglen-style interrogative questions about audience, exclusion, training data, or political/commercial beneficiaries.',
      },
      alt_text: {
        type: 'string',
        description: '30-to-80 word alt-text description of the artifact for accessibility.',
      },
      bears_on_dissertation_question: {
        type: 'boolean',
        description:
          'True if and only if the artifact provides distinctive evidence toward the dissertation question.',
      },
      dissertation_relevance: {
        type: 'string',
        description: 'One or two sentences explaining the relevance (or its absence).',
      },
      authorship_class: {
        type: 'string',
        enum: [...AUTHORSHIP_CLASSES],
        description:
          'Who made this, insofar as a typical viewer could tell: individual_creator, community_collective, commercial_institutional, state_affiliated, or ambiguous_unattributable (use when attribution is genuinely indeterminable, not as a low-effort fallback).',
      },
      ai_mediation: {
        type: 'string',
        enum: [...AI_MEDIATIONS],
        description:
          'Degree of AI involvement: human_made, ai_assisted, ai_generated, or unknown (only when the artifact gives no reliable signal).',
      },
      origin_ambiguity: {
        type: 'string',
        enum: [...ORIGIN_AMBIGUITIES],
        description:
          "How hard it is to recover the artifact's cultural, computational, and geographic origin: none, low, or high.",
      },
    },
    required: [
      ...flatAxisRequired,
      'paglen_questions',
      'alt_text',
      'bears_on_dissertation_question',
      'dissertation_relevance',
      'authorship_class',
      'ai_mediation',
      'origin_ambiguity',
    ],
  },
};
