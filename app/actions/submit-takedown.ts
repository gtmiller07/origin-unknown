'use server';

import { db } from '@/lib/db/client';
import { takedownRequests } from '@/lib/db/schema';
/**
 * Public takedown Server Action (Phase 7). Anyone depicted in or holding rights to an artifact can
 * request its removal; the row lands in takedown_requests (status 'pending') for curator review.
 * Email + relationship + reasoning are required; the artifact id is optional (a request can name a
 * URL in the reasoning if the id is unknown).
 */
import { z } from 'zod';
import type { ActionResult } from './result';

const schema = z.object({
  artifactId: z.union([z.string().uuid(), z.literal('')]).optional(),
  requesterEmail: z.string().email('A valid email is required so a curator can respond.'),
  requesterRelationship: z
    .string()
    .trim()
    .min(2, 'Please state your relationship to the content.')
    .max(200),
  reasoning: z
    .string()
    .trim()
    .min(20, 'Please give at least a sentence or two of reasoning.')
    .max(2000, 'Please keep the request under 2000 characters.'),
});

export async function submitTakedown(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    artifactId: (formData.get('artifactId') as string | null) ?? '',
    requesterEmail: formData.get('requesterEmail'),
    requesterRelationship: formData.get('requesterRelationship'),
    reasoning: formData.get('reasoning'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the form and try again.',
      field_errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await db.insert(takedownRequests).values({
      artifactId: parsed.data.artifactId ? parsed.data.artifactId : null,
      requesterEmail: parsed.data.requesterEmail,
      requesterRelationship: parsed.data.requesterRelationship,
      reasoning: parsed.data.reasoning,
    });
    return { ok: true, data: undefined };
  } catch {
    return {
      ok: false,
      error: 'Could not record the request right now. Please try again shortly.',
    };
  }
}
