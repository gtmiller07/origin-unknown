import { db } from '@/lib/db/client';
import type { Artifact } from '@/lib/db/schema';
import { artifacts, evidencePanels, scores, sources } from '@/lib/db/schema';
/**
 * Read-side queries for the admin vetting interview. The queue is the scored, not-removed,
 * not-yet-vetted backlog — the artifacts whose AI proposals still await a human in the loop. All
 * read-only, in Server Components, against the shared client.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';

export interface VetQueueItem {
  id: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  mediaType: string | null;
  sourceName: string | null;
  aiMediation: string | null;
  authorshipClass: string | null;
  originCode: string | null;
  scoreCount: number;
}

/** Scored artifacts still awaiting human vetting, newest first. */
export async function getVetQueue(limit = 60): Promise<VetQueueItem[]> {
  return (await db.execute(sql`
    SELECT a.id, a.title, a.description, a.thumbnail_url AS "thumbnailUrl",
      a.media_type AS "mediaType", a.ai_mediation AS "aiMediation",
      a.authorship_class AS "authorshipClass", (a.origin_country_codes)[1] AS "originCode",
      src.name AS "sourceName", count(s.id)::int AS "scoreCount"
    FROM artifacts a
    LEFT JOIN sources src ON src.id = a.source_id
    LEFT JOIN scores s ON s.artifact_id = a.id
    WHERE a.status = 'scored' AND a.removed_at IS NULL AND a.vetted_at IS NULL
    GROUP BY a.id, src.name
    ORDER BY a.first_seen_at DESC
    LIMIT ${limit}
  `)) as unknown as VetQueueItem[];
}

export interface VetStats {
  pending: number;
  vetted: number;
  removed: number;
}

export async function getVetStats(): Promise<VetStats> {
  const [r] = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status = 'scored' AND removed_at IS NULL AND vetted_at IS NULL)::int AS pending,
      count(*) FILTER (WHERE vetted_at IS NOT NULL AND removed_at IS NULL)::int AS vetted,
      count(*) FILTER (WHERE removed_at IS NOT NULL)::int AS removed
    FROM artifacts
  `)) as unknown as VetStats[];
  return r ?? { pending: 0, vetted: 0, removed: 0 };
}

export interface VetScore {
  axis: string;
  aiProposedValue: number | null;
  aiReasoning: string | null;
  humanConfirmedValue: number | null;
}

export interface VetItem {
  artifact: Artifact;
  sourceName: string | null;
  scores: VetScore[];
  paglenQuestions: string[];
  /** The next item in the queue (for skip / post-action navigation), or null when this is the last. */
  nextId: string | null;
}

/** Full payload for the per-artifact vetting interview. Null if the id is gone or already removed. */
export async function getVetItem(id: string): Promise<VetItem | null> {
  const [artifact] = await db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, id), isNull(artifacts.removedAt)))
    .limit(1);
  if (!artifact) return null;

  const sourceName = artifact.sourceId
    ? ((
        await db
          .select({ name: sources.name })
          .from(sources)
          .where(eq(sources.id, artifact.sourceId))
          .limit(1)
      )[0]?.name ?? null)
    : null;

  const scoreRows = await db
    .select({
      axis: scores.axis,
      aiProposedValue: scores.aiProposedValue,
      aiReasoning: scores.aiReasoning,
      humanConfirmedValue: scores.humanConfirmedValue,
    })
    .from(scores)
    .where(eq(scores.artifactId, id));

  const [panel] = await db
    .select({ paglenQuestions: evidencePanels.paglenQuestions })
    .from(evidencePanels)
    .where(eq(evidencePanels.artifactId, id))
    .limit(1);

  const [next] = (await db.execute(sql`
    SELECT id FROM artifacts
    WHERE status = 'scored' AND removed_at IS NULL AND vetted_at IS NULL AND id <> ${id}
    ORDER BY first_seen_at DESC LIMIT 1
  `)) as unknown as Array<{ id: string }>;

  return {
    artifact,
    sourceName,
    scores: scoreRows.map((s) => ({
      axis: s.axis,
      aiProposedValue: s.aiProposedValue == null ? null : Number(s.aiProposedValue),
      aiReasoning: s.aiReasoning,
      humanConfirmedValue: s.humanConfirmedValue == null ? null : Number(s.humanConfirmedValue),
    })),
    paglenQuestions: (panel?.paglenQuestions ?? []) as string[],
    nextId: next?.id ?? null,
  };
}

export interface RemovedItem {
  id: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  mediaType: string | null;
  sourceName: string | null;
  removedReason: string | null;
  removedAt: string | null;
  removedByName: string | null;
}

/** Soft-deleted artifacts, most recent first, with who removed them and why. */
export async function getRemovedArtifacts(limit = 100): Promise<RemovedItem[]> {
  return (await db.execute(sql`
    SELECT a.id, a.title, a.description, a.thumbnail_url AS "thumbnailUrl",
      a.media_type AS "mediaType", src.name AS "sourceName",
      a.removed_reason AS "removedReason", a.removed_at AS "removedAt",
      cur.display_name AS "removedByName"
    FROM artifacts a
    LEFT JOIN sources src ON src.id = a.source_id
    LEFT JOIN curators cur ON cur.id = a.removed_by
    WHERE a.removed_at IS NOT NULL
    ORDER BY a.removed_at DESC
    LIMIT ${limit}
  `)) as unknown as RemovedItem[];
}
