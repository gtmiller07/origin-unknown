'use server';

import { getCurrentCurator } from '@/lib/admin/auth';
import { db } from '@/lib/db/client';
import { artifacts, scores, scoringEvents } from '@/lib/db/schema';
import { AXIS_GUIDES } from '@/lib/vetting/axes';
/**
 * Vetting Server Actions (admin). Both re-verify the curator (auth can't be assumed from the page),
 * write through the shared client, revalidate the affected public surfaces, then advance to the next
 * queue item. confirmVetting makes the methodology's "proposals → human-confirmed" loop real: per
 * axis it writes human_confirmed_value (+ value, confirmer, timestamp) and appends a scoring_events
 * row, then stamps vetted_at on the artifact. removeArtifact is the soft delete — it hides the
 * artifact from every public read but preserves the row and its audit trail, and is reversible.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export type VetState = { error: string } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

function nextDestination(formData: FormData, done: string): string {
  const nextId = String(formData.get('nextId') ?? '');
  return UUID.test(nextId) ? `/admin/queue/${nextId}` : `/admin/queue?done=${done}`;
}

export async function confirmVetting(_prev: VetState, formData: FormData): Promise<VetState> {
  const curator = await getCurrentCurator();
  if (!curator) return { error: 'Your session has expired. Reload the page and sign in again.' };

  const artifactId = String(formData.get('artifactId') ?? '');
  if (!UUID.test(artifactId)) return { error: 'Missing or malformed artifact id.' };

  const [artifact] = await db
    .select({ id: artifacts.id })
    .from(artifacts)
    .where(and(eq(artifacts.id, artifactId), isNull(artifacts.removedAt)))
    .limit(1);
  if (!artifact) return { error: 'That artifact no longer exists or was already removed.' };

  const existing = await db
    .select({ axis: scores.axis, aiProposedValue: scores.aiProposedValue })
    .from(scores)
    .where(eq(scores.artifactId, artifactId));
  const aiByAxis = new Map(
    existing.map((s) => [s.axis, s.aiProposedValue == null ? null : Number(s.aiProposedValue)])
  );

  const bears = formData.get('bearsOnDissertation') === 'on';
  const altOk = formData.get('altTextConfirmed') === 'on';
  const now = new Date().toISOString();

  try {
    await db.transaction(async (tx) => {
      for (const g of AXIS_GUIDES) {
        if (!aiByAxis.has(g.key)) continue; // axis not scored — leave it untouched
        const aiVal = aiByAxis.get(g.key) ?? null;
        const action = String(formData.get(`axis_${g.key}_action`) ?? 'confirm');
        const note = String(formData.get(`axis_${g.key}_note`) ?? '').trim() || null;

        let confirmed = aiVal;
        let revised = false;
        if (action === 'revise') {
          const raw = Number(formData.get(`axis_${g.key}_value`));
          if (Number.isFinite(raw)) {
            confirmed = clamp01(raw);
            revised = confirmed !== aiVal;
          }
        }
        const confirmedStr = confirmed == null ? null : confirmed.toFixed(2);

        await tx
          .update(scores)
          .set({
            value: confirmedStr,
            humanConfirmedValue: confirmedStr,
            humanReasoning: note,
            humanConfirmerId: curator.id,
            humanConfirmedAt: now,
            updatedAt: now,
          })
          .where(and(eq(scores.artifactId, artifactId), eq(scores.axis, g.key)));

        await tx.insert(scoringEvents).values({
          artifactId,
          axis: g.key,
          eventType: revised ? 'human_overrode' : 'human_confirmed',
          previousValue: aiVal == null ? null : aiVal.toFixed(2),
          newValue: confirmedStr,
          reasoning:
            note ??
            (revised ? 'Revised by curator during vetting.' : 'Confirmed by curator during vetting.'),
          actorId: curator.id,
        });
      }

      await tx
        .update(artifacts)
        .set({
          vettedAt: now,
          vettedBy: curator.id,
          bearsOnDissertationQuestion: bears,
          altTextConfirmed: altOk,
          updatedAt: now,
        })
        .where(eq(artifacts.id, artifactId));
    });
  } catch {
    return { error: 'Could not save the review. Please try again.' };
  }

  revalidatePath('/admin/queue');
  revalidatePath(`/artifact/${artifactId}`);
  revalidatePath('/corpus');
  revalidatePath('/live');
  revalidatePath('/scoring-log');

  redirect(nextDestination(formData, 'vetted'));
}

export async function removeArtifact(_prev: VetState, formData: FormData): Promise<VetState> {
  const curator = await getCurrentCurator();
  if (!curator) return { error: 'Your session has expired. Reload the page and sign in again.' };

  const artifactId = String(formData.get('artifactId') ?? '');
  if (!UUID.test(artifactId)) return { error: 'Missing or malformed artifact id.' };

  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 10) {
    return { error: 'Please give a brief reason (at least 10 characters) for the audit trail.' };
  }

  const now = new Date().toISOString();
  try {
    await db
      .update(artifacts)
      .set({
        removedAt: now,
        removedReason: reason,
        removedBy: curator.id,
        updatedAt: now,
      })
      .where(and(eq(artifacts.id, artifactId), isNull(artifacts.removedAt)));
  } catch {
    return { error: 'Could not remove the artifact. Please try again.' };
  }

  revalidatePath('/admin/queue');
  revalidatePath(`/artifact/${artifactId}`);
  revalidatePath('/corpus');
  revalidatePath('/live');
  revalidatePath('/search');
  revalidatePath('/tunnel');
  revalidatePath('/scoring-log');

  redirect(nextDestination(formData, 'removed'));
}

export async function restoreArtifact(_prev: VetState, formData: FormData): Promise<VetState> {
  const curator = await getCurrentCurator();
  if (!curator) return { error: 'Your session has expired. Reload the page and sign in again.' };

  const artifactId = String(formData.get('artifactId') ?? '');
  if (!UUID.test(artifactId)) return { error: 'Missing or malformed artifact id.' };

  try {
    await db
      .update(artifacts)
      .set({
        removedAt: null,
        removedReason: null,
        removedBy: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(artifacts.id, artifactId));
  } catch {
    return { error: 'Could not restore the artifact. Please try again.' };
  }

  revalidatePath('/admin/removed');
  revalidatePath('/admin/queue');
  revalidatePath(`/artifact/${artifactId}`);
  revalidatePath('/corpus');
  revalidatePath('/live');
  revalidatePath('/search');
  revalidatePath('/tunnel');
  revalidatePath('/scoring-log');

  // No redirect — stay on /admin/removed; the revalidated list drops the restored row.
  return null;
}
