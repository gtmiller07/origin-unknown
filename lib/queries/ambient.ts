import { db } from '@/lib/db/client';
/**
 * Read-side queries for the Phase 6 live feed / ambient field. Each scored artifact becomes a
 * particle; its axis scores drive the visual mapping (aesthetic → colour, reach → size, the three
 * diplomatic sub-measures → glow). Read-only, in Server Components.
 */
import { sql } from 'drizzle-orm';

export interface Particle {
  id: string;
  title: string | null;
  origin: string | null;
  aesthetic: number | null;
  reach: number | null;
  diplomatic: number | null;
}

interface ParticleRow {
  id: string;
  title: string | null;
  origin: string | null;
  aesthetic: string | null;
  reach: string | null;
  diplomatic: string | null;
}

const numeric = (v: string | null): number | null => (v == null ? null : Number(v));

export async function getAmbientParticles(limit = 400): Promise<Particle[]> {
  const rows = (await db.execute(sql`
    SELECT a.id, a.title, (a.origin_country_codes)[1] AS origin,
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'aesthetic_signal') AS aesthetic,
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'reach') AS reach,
      avg(s.ai_proposed_value) FILTER (
        WHERE s.axis IN ('diplomatic_cross_boundary', 'diplomatic_authenticity', 'diplomatic_reciprocity')
      ) AS diplomatic
    FROM artifacts a
    JOIN scores s ON s.artifact_id = a.id
    WHERE a.status = 'scored'
    GROUP BY a.id
    ORDER BY a.first_seen_at DESC
    LIMIT ${limit}
  `)) as unknown as ParticleRow[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    origin: r.origin,
    aesthetic: numeric(r.aesthetic),
    reach: numeric(r.reach),
    diplomatic: numeric(r.diplomatic),
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
    WHERE a.status = 'scored'
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
    aesthetic: numeric(r.aesthetic),
    reach: numeric(r.reach),
    diplomatic: numeric(r.diplomatic),
  }));
}
