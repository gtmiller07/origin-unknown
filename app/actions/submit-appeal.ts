'use server';

import { db } from '@/lib/db/client';
import { publicAppeals } from '@/lib/db/schema';
/**
 * Public appeal Server Action (Phase 4). A viewer who contests a score submits axis-scoped
 * reasoning; the row lands in public_appeals with status 'pending' for curator review. No auth —
 * the corpus invites challenge by design — but reasoning is required and length-bounded, and the
 * email is optional (the appeal is the record, not the contact).
 */
import { z } from 'zod';
import type { ActionResult } from './result';

const AXES = [
  'origin',
  'reach',
  'aesthetic_signal',
  'diplomatic_cross_boundary',
  'diplomatic_authenticity',
  'diplomatic_reciprocity',
] as const;

const schema = z.object({
  artifactId: z.string().uuid(),
  axis: z.enum(AXES),
  challengerEmail: z.union([z.string().email(), z.literal('')]).optional(),
  challengerReasoning: z
    .string()
    .trim()
    .min(20, 'Please give at least a sentence or two of reasoning.')
    .max(2000, 'Please keep the appeal under 2000 characters.'),
});

export async function submitAppeal(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    artifactId: formData.get('artifactId'),
    axis: formData.get('axis'),
    challengerEmail: (formData.get('challengerEmail') as string | null) ?? '',
    challengerReasoning: formData.get('challengerReasoning'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the form and try again.',
      field_errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await db.insert(publicAppeals).values({
      artifactId: parsed.data.artifactId,
      axis: parsed.data.axis,
      challengerEmail: parsed.data.challengerEmail ? parsed.data.challengerEmail : null,
      challengerReasoning: parsed.data.challengerReasoning,
    });
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: 'Could not record the appeal right now. Please try again shortly.' };
  }
}
