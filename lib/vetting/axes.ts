import type { AxisKey } from '@/lib/queries/artifact';
/**
 * Plain-language guides for the six scoring axes (construct v1.2), written for the vetting interview.
 * Their job is to orient a reviewer who knows nothing about the project well enough to judge whether
 * the instrument read an artifact reasonably — not to restate the rubric verbatim. The authoritative
 * rubric is the active scoring prompt, surfaced on /methodology and /scoring-prompts; the interview
 * links there. `low`/`high` describe the ends of the 0–1 scale so a reviewer can sanity-check a value
 * without memorizing definitions.
 */
export interface AxisGuide {
  key: AxisKey;
  label: string;
  /** The question the reviewer is really answering. */
  question: string;
  /** One-line plain definition. */
  plain: string;
  /** What a score near 0 means. */
  low: string;
  /** What a score near 1 means. */
  high: string;
}

export const AXIS_GUIDES: AxisGuide[] = [
  {
    key: 'origin',
    label: 'Origin ambiguity',
    question: 'How traceable is where this came from?',
    plain: 'How hard it is to tell where — and from whom — this artifact originated.',
    low: 'clear, attributable origin',
    high: 'origin ambiguous or unknowable',
  },
  {
    key: 'reach',
    label: 'Reach',
    question: 'How far has it traveled?',
    plain: 'How widely the artifact has spread across platforms and audiences.',
    low: 'little measurable spread',
    high: 'wide, cross-platform diffusion',
  },
  {
    key: 'aesthetic_signal',
    label: 'Aesthetic signal',
    question: 'How distinctive is its craft?',
    plain: 'How strong and distinctive the aesthetic or production signature is.',
    low: 'generic or low-effort',
    high: 'strong, distinctive aesthetic',
  },
  {
    key: 'diplomatic_cross_boundary',
    label: 'Crosses boundaries',
    question: 'Does it move across cultures?',
    plain: 'How much it travels across a cultural or national boundary rather than staying within one.',
    low: 'stays within one culture',
    high: 'clearly crosses cultural/national lines',
  },
  {
    key: 'diplomatic_authenticity',
    label: 'Authenticity',
    question: 'Is it grounded in a real tradition?',
    plain: 'How grounded the work is in a living cultural tradition, versus hollow or appropriative.',
    low: 'hollow or appropriative',
    high: 'grounded in a living tradition',
  },
  {
    key: 'diplomatic_reciprocity',
    label: 'Reciprocity',
    question: 'Does the exchange run both ways?',
    plain: 'Whether the cultural exchange is mutual rather than one-directional.',
    low: 'one-directional',
    high: 'mutual, reciprocal exchange',
  },
];
