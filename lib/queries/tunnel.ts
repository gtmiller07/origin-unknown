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
  languageCode: string | null;
  aiMediation: string | null;
  authorshipClass: string | null;
  year: number | null;
  aesthetic: number | null;
  reach: number | null;
  /** 0–1: how traceable the origin is (high = clear). Used to encode thesis in tile color drift. */
  origin: number | null;
  authenticity: number | null;
  reciprocity: number | null;
  crossboundary: number | null;
  /** Angular pull from the artifact's nearest neighbor (#9 embedding-clustered placement).
   *  Null when no neighbor data exists. Used to gently attract semantically similar tiles. */
  /** Top-2 neighbor artifact ids for lineage thread rendering (#10) and cluster pull (#9). */
  neighborIds: string[];
}

interface TunnelRow {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  originCode: string | null;
  languageCode: string | null;
  aiMediation: string | null;
  authorship: string | null;
  year: number | null;
  aesthetic: string | null;
  reach: string | null;
  origin: string | null;
  authenticity: string | null;
  reciprocity: string | null;
  crossboundary: string | null;
  neighborIds: string | null; // JSON array of uuid strings
}

export async function getTunnelArtifacts(limit = 2000): Promise<TunnelArtifact[]> {
  const rows = (await db.execute(sql`
    SELECT a.id, a.title, a.thumbnail_url AS "thumbnailUrl",
      (a.origin_country_codes)[1] AS "originCode", (a.language_codes)[1] AS "languageCode",
      a.ai_mediation AS "aiMediation",
      a.authorship_class AS authorship,
      extract(year FROM a.published_at)::int AS year,
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'aesthetic_signal') AS aesthetic,
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'reach') AS reach,
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'origin') AS origin,
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'diplomatic_authenticity') AS authenticity,
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'diplomatic_reciprocity') AS reciprocity,
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'diplomatic_cross_boundary') AS crossboundary,
      -- #9/#10 Top-2 neighbor ids for wall-cluster pull and lineage threads.
      -- Returns null when artifact_neighbors table is empty (before compute-neighbors runs).
      (SELECT json_agg(an.neighbor_id ORDER BY an.rank)
       FROM artifact_neighbors an
       WHERE an.artifact_id = a.id AND an.rank < 2
      )::text AS "neighborIds"
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
    languageCode: r.languageCode,
    aiMediation: r.aiMediation,
    authorshipClass: r.authorship,
    year: r.year,
    aesthetic: r.aesthetic == null ? null : Number(r.aesthetic),
    reach: r.reach == null ? null : Number(r.reach),
    origin: r.origin == null ? null : Number(r.origin),
    authenticity: r.authenticity == null ? null : Number(r.authenticity),
    reciprocity: r.reciprocity == null ? null : Number(r.reciprocity),
    crossboundary: r.crossboundary == null ? null : Number(r.crossboundary),
    neighborIds: (() => {
      try { return r.neighborIds ? (JSON.parse(r.neighborIds) as string[]) : []; }
      catch { return []; }
    })(),
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
  /** One-sentence curatorial claim — what the juxtaposition argues. */
  claim?: string;
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
