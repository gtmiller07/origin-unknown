import { db } from '@/lib/db/client';
/**
 * Read-side queries for the Phase 6 live feed / ambient field. Each scored artifact becomes a
 * particle carrying all six axis scores (so the field can map a subset and the hover scorecard can
 * show the whole), plus the thumbnail + tags the hover card needs. Read-only, in Server Components.
 */
import { sql } from 'drizzle-orm';

export interface ParticleAxes {
  origin: number | null;
  reach: number | null;
  aesthetic_signal: number | null;
  diplomatic_cross_boundary: number | null;
  diplomatic_authenticity: number | null;
  diplomatic_reciprocity: number | null;
}

export interface Particle {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  mediaType: string | null;
  sourceName: string | null;
  originCode: string | null;
  axes: ParticleAxes;
}

interface ParticleRow {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  mediaType: string | null;
  sourceName: string | null;
  originCode: string | null;
  origin: string | null;
  reach: string | null;
  aesthetic: string | null;
  crossb: string | null;
  authenticity: string | null;
  reciprocity: string | null;
}

const num = (v: string | null): number | null => (v == null ? null : Number(v));

export async function getAmbientParticles(limit = 400): Promise<Particle[]> {
  const rows = (await db.execute(sql`
    SELECT a.id, a.title, a.thumbnail_url AS "thumbnailUrl", a.media_type AS "mediaType",
      src.name AS "sourceName", (a.origin_country_codes)[1] AS "originCode",
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'origin') AS origin,
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'reach') AS reach,
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'aesthetic_signal') AS aesthetic,
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'diplomatic_cross_boundary') AS crossb,
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'diplomatic_authenticity') AS authenticity,
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'diplomatic_reciprocity') AS reciprocity
    FROM artifacts a
    JOIN scores s ON s.artifact_id = a.id
    LEFT JOIN sources src ON src.id = a.source_id
    WHERE a.status = 'scored' AND a.removed_at IS NULL
    GROUP BY a.id, src.name
    ORDER BY a.first_seen_at DESC
    LIMIT ${limit}
  `)) as unknown as ParticleRow[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    thumbnailUrl: r.thumbnailUrl,
    mediaType: r.mediaType,
    sourceName: r.sourceName,
    originCode: r.originCode,
    axes: {
      origin: num(r.origin),
      reach: num(r.reach),
      aesthetic_signal: num(r.aesthetic),
      diplomatic_cross_boundary: num(r.crossb),
      diplomatic_authenticity: num(r.authenticity),
      diplomatic_reciprocity: num(r.reciprocity),
    },
  }));
}

export interface LiveStatus {
  scored: number;
  artifacts: number;
  sources: number;
}

export async function getLiveStatus(): Promise<LiveStatus> {
  const [a] = (await db.execute(sql`
    SELECT count(*) FILTER (WHERE status = 'scored')::int AS scored, count(*)::int AS artifacts
    FROM artifacts
    WHERE removed_at IS NULL
  `)) as unknown as Array<{ scored: number; artifacts: number }>;
  const [s] = (await db.execute(sql`
    SELECT count(*)::int AS sources FROM sources WHERE enabled = true
  `)) as unknown as Array<{ sources: number }>;
  return { scored: a?.scored ?? 0, artifacts: a?.artifacts ?? 0, sources: s?.sources ?? 0 };
}

export interface LiveItem {
  id: string;
  title: string | null;
  description: string | null;
  mediaType: string | null;
  sourceName: string | null;
  aiMediation: string | null;
  aesthetic: number | null;
  reach: number | null;
  diplomatic: number | null;
}

interface LiveItemRow extends Omit<LiveItem, 'aesthetic' | 'reach' | 'diplomatic'> {
  aesthetic: string | null;
  reach: string | null;
  diplomatic: string | null;
}

export async function listLivePublished(limit = 60): Promise<LiveItem[]> {
  const rows = (await db.execute(sql`
    SELECT a.id, a.title, a.description, a.media_type AS "mediaType",
      a.ai_mediation AS "aiMediation", src.name AS "sourceName",
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'aesthetic_signal') AS aesthetic,
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'reach') AS reach,
      avg(s.ai_proposed_value) FILTER (
        WHERE s.axis IN ('diplomatic_cross_boundary', 'diplomatic_authenticity', 'diplomatic_reciprocity')
      ) AS diplomatic
    FROM artifacts a
    JOIN scores s ON s.artifact_id = a.id
    LEFT JOIN sources src ON src.id = a.source_id
    WHERE a.status = 'scored' AND a.removed_at IS NULL
    GROUP BY a.id, src.name
    ORDER BY a.first_seen_at DESC
    LIMIT ${limit}
  `)) as unknown as LiveItemRow[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    mediaType: r.mediaType,
    sourceName: r.sourceName,
    aiMediation: r.aiMediation,
    aesthetic: num(r.aesthetic),
    reach: num(r.reach),
    diplomatic: num(r.diplomatic),
  }));
}
