import { db } from '@/lib/db/client';
/**
 * Read-side queries for the admin governance surfaces: public takedown requests and score appeals.
 * Both list pending items first, joined to the artifact they concern (and, for appeals, the current
 * score on the challenged axis) so a curator can decide in context. Read-only, in Server Components.
 */
import { sql } from 'drizzle-orm';

export interface TakedownRow {
  id: string;
  artifactId: string | null;
  artifactTitle: string | null;
  artifactRemovedAt: string | null;
  requesterEmail: string;
  requesterRelationship: string;
  reasoning: string;
  status: string;
  reviewNotes: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
}

export async function getTakedownRequests(limit = 100): Promise<TakedownRow[]> {
  return (await db.execute(sql`
    SELECT t.id, t.artifact_id AS "artifactId", a.title AS "artifactTitle",
      a.removed_at AS "artifactRemovedAt", t.requester_email AS "requesterEmail",
      t.requester_relationship AS "requesterRelationship", t.reasoning, t.status,
      t.review_notes AS "reviewNotes", t.reviewed_at AS "reviewedAt", t.created_at AS "createdAt",
      cur.display_name AS "reviewedByName"
    FROM takedown_requests t
    LEFT JOIN artifacts a ON a.id = t.artifact_id
    LEFT JOIN curators cur ON cur.id = t.reviewer_id
    ORDER BY (t.status = 'pending') DESC, t.created_at DESC
    LIMIT ${limit}
  `)) as unknown as TakedownRow[];
}

export interface AppealRow {
  id: string;
  artifactId: string | null;
  artifactTitle: string | null;
  axis: string;
  challengerEmail: string | null;
  challengerReasoning: string;
  status: string;
  reviewNotes: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
  aiValue: number | null;
  humanValue: number | null;
  aiReasoning: string | null;
}

export async function getAppeals(limit = 100): Promise<AppealRow[]> {
  const rows = (await db.execute(sql`
    SELECT p.id, p.artifact_id AS "artifactId", a.title AS "artifactTitle", p.axis,
      p.challenger_email AS "challengerEmail", p.challenger_reasoning AS "challengerReasoning",
      p.status, p.review_notes AS "reviewNotes", p.reviewed_at AS "reviewedAt",
      p.created_at AS "createdAt", cur.display_name AS "reviewedByName",
      s.ai_proposed_value AS "aiValue", s.human_confirmed_value AS "humanValue",
      s.ai_reasoning AS "aiReasoning"
    FROM public_appeals p
    LEFT JOIN artifacts a ON a.id = p.artifact_id
    LEFT JOIN curators cur ON cur.id = p.reviewer_id
    LEFT JOIN scores s ON s.artifact_id = p.artifact_id AND s.axis = p.axis
    ORDER BY (p.status = 'pending') DESC, p.created_at DESC
    LIMIT ${limit}
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as string,
    artifactId: (r.artifactId as string | null) ?? null,
    artifactTitle: (r.artifactTitle as string | null) ?? null,
    axis: r.axis as string,
    challengerEmail: (r.challengerEmail as string | null) ?? null,
    challengerReasoning: r.challengerReasoning as string,
    status: r.status as string,
    reviewNotes: (r.reviewNotes as string | null) ?? null,
    reviewedByName: (r.reviewedByName as string | null) ?? null,
    reviewedAt: (r.reviewedAt as string | null) ?? null,
    createdAt: (r.createdAt as string | null) ?? null,
    aiValue: r.aiValue == null ? null : Number(r.aiValue),
    humanValue: r.humanValue == null ? null : Number(r.humanValue),
    aiReasoning: (r.aiReasoning as string | null) ?? null,
  }));
}

export interface GovernanceStats {
  takedownsPending: number;
  appealsPending: number;
}

export async function getGovernanceStats(): Promise<GovernanceStats> {
  const [r] = (await db.execute(sql`
    SELECT
      (SELECT count(*) FROM takedown_requests WHERE status = 'pending')::int AS "takedownsPending",
      (SELECT count(*) FROM public_appeals WHERE status = 'pending')::int AS "appealsPending"
  `)) as unknown as GovernanceStats[];
  return r ?? { takedownsPending: 0, appealsPending: 0 };
}
