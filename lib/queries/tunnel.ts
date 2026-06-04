import { db } from '@/lib/db/client';
import { eraStations } from '@/lib/db/schema';
/**
 * Read-side queries for the Phase 5 tunnel. Artifacts populate the corridor walls positioned by
 * published_at (Z = time, 1998→2026) and origin (X = Western left / non-Western right); era stations
 * anchor the timeline. Read-only, in Server Components. The corpus skews recent, so the corridor is
 * honestly sparse in the past and dense toward the present — which is itself the content-explosion
 * the geometry dramatizes.
 */
import { eq, sql } from 'drizzle-orm';

export interface TunnelArtifact {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  originCode: string | null;
  aiMediation: string | null;
  authorshipClass: string | null;
  year: number | null;
  aesthetic: number | null;
  reach: number | null;
}

interface TunnelRow {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  originCode: string | null;
  aiMediation: string | null;
  authorship: string | null;
  year: number | null;
  aesthetic: string | null;
  reach: string | null;
}

export async function getTunnelArtifacts(limit = 600): Promise<TunnelArtifact[]> {
  const rows = (await db.execute(sql`
    SELECT a.id, a.title, a.thumbnail_url AS "thumbnailUrl",
      (a.origin_country_codes)[1] AS "originCode", a.ai_mediation AS "aiMediation",
      a.authorship_class AS authorship,
      extract(year FROM a.published_at)::int AS year,
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'aesthetic_signal') AS aesthetic,
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'reach') AS reach
    FROM artifacts a
    JOIN scores s ON s.artifact_id = a.id
    WHERE a.status = 'scored' AND a.published_at IS NOT NULL AND a.removed_at IS NULL
    GROUP BY a.id
    ORDER BY a.published_at
    LIMIT ${limit}
  `)) as unknown as TunnelRow[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    thumbnailUrl: r.thumbnailUrl,
    originCode: r.originCode,
    aiMediation: r.aiMediation,
    authorshipClass: r.authorship,
    year: r.year,
    aesthetic: r.aesthetic == null ? null : Number(r.aesthetic),
    reach: r.reach == null ? null : Number(r.reach),
  }));
}

export interface StationVariable {
  id: string;
  label: string;
  type: 'toggle' | 'slider';
  default: boolean | number;
  unit?: string;
  min?: number;
  max?: number;
  description: string;
  filter_predicate: string;
}
export interface ComparativeGridSpec {
  id: string;
  label: string;
  description: string;
  group_by: string;
  sort_by: string;
  max_per_group: number;
  layout: 'grid' | 'strip';
}
export interface Station {
  id: string;
  position: number;
  title: string;
  description: string | null;
  technicalMarker: string | null;
  startYear: number | null;
  artifactDensity: number | null;
  interactiveVariables: StationVariable[];
  comparativeGrids: ComparativeGridSpec[];
}

export async function getStations(): Promise<Station[]> {
  const rows = await db
    .select()
    .from(eraStations)
    .where(eq(eraStations.isVisible, true))
    .orderBy(eraStations.position);
  return rows.map((r) => ({
    id: r.id,
    position: Number(r.position),
    title: r.title,
    description: r.description,
    technicalMarker: r.technicalMarker,
    startYear: r.startDate ? new Date(r.startDate).getUTCFullYear() : null,
    artifactDensity: r.artifactDensity ?? null,
    interactiveVariables: (Array.isArray(r.interactiveVariables)
      ? r.interactiveVariables
      : []) as StationVariable[],
    comparativeGrids: (Array.isArray(r.comparativeGrids)
      ? r.comparativeGrids
      : []) as ComparativeGridSpec[],
  }));
}

/** Density histogram (artifact count by year) for the progress sparkline. */
export async function getYearDensity(): Promise<Array<{ year: number; count: number }>> {
  const rows = (await db.execute(sql`
    SELECT extract(year FROM published_at)::int AS year, count(*)::int AS count
    FROM artifacts
    WHERE status = 'scored' AND published_at IS NOT NULL AND removed_at IS NULL
    GROUP BY year ORDER BY year
  `)) as unknown as Array<{ year: number; count: number }>;
  return rows;
}
