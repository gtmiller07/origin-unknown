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
 * One axis result. `value` is lenient on range (the model is steered into
 * [0, 1] by the tool schema and the persistence layer clamps) but strict that a
 * score is either a number or an explicit null — never silently missing.
 */
export const AxisScoreSchema = z.object({
  value: z.number().nullable(),
  reasoning: z.string().min(1),
});

export type AxisScore = z.infer<typeof AxisScoreSchema>;

/** The full structured result, validated after the forced tool call returns. */
export const ScoringResultSchema = z.object({
  scores: z.object({
    origin: AxisScoreSchema,
    reach: AxisScoreSchema,
    aesthetic_signal: AxisScoreSchema,
    diplomatic_cross_boundary: AxisScoreSchema,
    diplomatic_authenticity: AxisScoreSchema,
    diplomatic_reciprocity: AxisScoreSchema,
  }),
  paglen_questions: z.array(z.string().min(1)).min(1),
  alt_text: z.string().min(1),
  bears_on_dissertation_question: z.boolean(),
  dissertation_relevance: z.string(),
});

export type ScoringResult = z.infer<typeof ScoringResultSchema>;

/** JSON-schema fragment describing one axis entry in the tool input. */
const axisInputSchema = {
  type: 'object',
  properties: {
    value: {
      anyOf: [{ type: 'number', minimum: 0, maximum: 1 }, { type: 'null' }],
      description:
        'Score in [0.00, 1.00], or null if the axis cannot be scored from the available evidence.',
    },
    reasoning: {
      type: 'string',
      description:
        '50-to-150 words naming the specific evidence and inferential steps behind the score.',
    },
  },
  required: ['value', 'reasoning'],
};

const scoresProperties: Record<string, unknown> = Object.fromEntries(
  AXIS_KEYS.map((key) => [key, { ...axisInputSchema, description: `${AXIS_LABELS[key]} axis.` }])
);

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
      scores: {
        type: 'object',
        properties: scoresProperties,
        required: [...AXIS_KEYS],
      },
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
    },
    required: [
      'scores',
      'paglen_questions',
      'alt_text',
      'bears_on_dissertation_question',
      'dissertation_relevance',
    ],
  },
};
