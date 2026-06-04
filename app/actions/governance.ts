'use server';

import { getCurrentCurator } from '@/lib/admin/auth';
import { db } from '@/lib/db/client';
import { artifacts, publicAppeals, scores, scoringEvents, takedownRequests } from '@/lib/db/schema';
/**
 * Governance Server Actions: a curator resolving public takedown requests and score appeals. Both
 * re-verify the curator and revalidate affected surfaces. Honoring a takedown routes through the same
 * soft delete as the vetting interview (removed_at, reversible from /admin/removed). Upholding an
 * appeal reuses the score-revision path — it writes human_confirmed_value + a scoring_events row, so
 * the change is auditable and shows in the public scoring log. Status values match the DB CHECK
 * constraints: honored/declined for takedowns, accepted/rejected for appeals.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export type GovState = { error: string } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

export async function resolveTakedown(_prev: GovState, formData: FormData): Promise<GovState> {
  const curator = await getCurrentCurator();
  if (!curator) return { error: 'Your session has expired. Reload the page and sign in again.' };

  const id = String(formData.get('takedownId') ?? '');
  if (!UUID.test(id)) return { error: 'Missing or malformed request id.' };
  const decision = String(formData.get('decision') ?? '');
  if (decision !== 'honor' && decision !== 'decline') return { error: 'Unknown decision.' };
  const note = String(formData.get('note') ?? '').trim() || null;
  const now = new Date().toISOString();

  const [t] = await db
    .select({ artifactId: takedownRequests.artifactId })
    .from(takedownRequests)
    .where(eq(takedownRequests.id, id))
    .limit(1);
  if (!t) return { error: 'That request no longer exists.' };

  try {
    await db.transaction(async (tx) => {
      if (decision === 'honor' && t.artifactId) {
        await tx
          .update(artifacts)
          .set({
            removedAt: now,
            removedReason: note ? `Takedown honored: ${note}` : 'Takedown request honored.',
            removedBy: curator.id,
            updatedAt: now,
          })
          .where(and(eq(artifacts.id, t.artifactId), isNull(artifacts.removedAt)));
      }
      await tx
        .update(takedownRequests)
        .set({
          status: decision === 'honor' ? 'honored' : 'declined',
          reviewerId: curator.id,
          reviewedAt: now,
          reviewNotes: note,
        })
        .where(eq(takedownRequests.id, id));
    });
  } catch {
    return { error: 'Could not record the decision. Please try again.' };
  }

  revalidatePath('/admin/takedowns');
  if (decision === 'honor' && t.artifactId) {
    revalidatePath('/admin/removed');
    revalidatePath('/admin/queue');
    revalidatePath(`/artifact/${t.artifactId}`);
    revalidatePath('/corpus');
    revalidatePath('/live');
    revalidatePath('/search');
    revalidatePath('/tunnel');
    revalidatePath('/scoring-log');
  }
  return null;
}

export async function resolveAppeal(_prev: GovState, formData: FormData): Promise<GovState> {
  const curator = await getCurrentCurator();
  if (!curator) return { error: 'Your session has expired. Reload the page and sign in again.' };

  const id = String(formData.get('appealId') ?? '');
  if (!UUID.test(id)) return { error: 'Missing or malformed appeal id.' };
  const decision = String(formData.get('decision') ?? '');
  if (decision !== 'accept' && decision !== 'reject') return { error: 'Unknown decision.' };
  const note = String(formData.get('note') ?? '').trim() || null;
  const now = new Date().toISOString();

  const [p] = await db
    .select({ artifactId: publicAppeals.artifactId, axis: publicAppeals.axis })
    .from(publicAppeals)
    .where(eq(publicAppeals.id, id))
    .limit(1);
  if (!p) return { error: 'That appeal no longer exists.' };

  let aiVal: number | null = null;
  if (p.artifactId) {
    const [s] = await db
      .select({ ai: scores.aiProposedValue })
      .from(scores)
      .where(and(eq(scores.artifactId, p.artifactId), eq(scores.axis, p.axis)))
      .limit(1);
    aiVal = s?.ai == null ? null : Number(s.ai);
  }

  let confirmed: number | null = aiVal;
  if (decision === 'accept') {
    const raw = Number(formData.get('newValue'));
    if (!Number.isFinite(raw)) return { error: 'Enter a revised score (0–1) to uphold the appeal.' };
    confirmed = clamp01(raw);
  }
  const confirmedStr = confirmed == null ? null : confirmed.toFixed(2);

  try {
    await db.transaction(async (tx) => {
      if (p.artifactId) {
        await tx
          .update(scores)
          .set({
            value: confirmedStr,
            humanConfirmedValue: confirmedStr,
            humanReasoning: note ?? (decision === 'accept' ? 'Appeal upheld.' : 'Appeal reviewed; score kept.'),
            humanConfirmerId: curator.id,
            humanConfirmedAt: now,
            updatedAt: now,
          })
          .where(and(eq(scores.artifactId, p.artifactId), eq(scores.axis, p.axis)));
        await tx.insert(scoringEvents).values({
          artifactId: p.artifactId,
          axis: p.axis,
          eventType: decision === 'accept' ? 'human_overrode' : 'human_confirmed',
          previousValue: aiVal == null ? null : aiVal.toFixed(2),
          newValue: confirmedStr,
          reasoning:
            note ??
            (decision === 'accept'
              ? 'Appeal upheld by curator.'
              : 'Appeal reviewed; AI score upheld by curator.'),
          actorId: curator.id,
        });
      }
      await tx
        .update(publicAppeals)
        .set({
          status: decision === 'accept' ? 'accepted' : 'rejected',
          reviewerId: curator.id,
          reviewedAt: now,
          reviewNotes: note,
        })
        .where(eq(publicAppeals.id, id));
    });
  } catch {
    return { error: 'Could not record the decision. Please try again.' };
  }

  revalidatePath('/admin/appeals');
  if (p.artifactId) {
    revalidatePath(`/artifact/${p.artifactId}`);
    revalidatePath('/corpus');
    revalidatePath('/live');
    revalidatePath('/scoring-log');
  }
  return null;
}
