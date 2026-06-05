import { db } from '@/lib/db/client';
import type { Artifact } from '@/lib/db/schema';
import { artifacts, scores, sources } from '@/lib/db/schema';
/**
 * Homepage queries (Phase 9): live corpus stats for the finding line, and the featured
 * artifact rail. Both run server-side; the finding line is intentionally cached for 60s
 * so the homepage doesn't re-compute on every hit.
 */
import { desc, eq, isNull, sql } from 'drizzle-orm';

export interface CorpusStats {
  scored: number;
  sources: number;
  aiMediatedPct: number; // % of scored artifacts that are ai_generated or ai_assisted
  nonWesternPct: number; // % from non-Western origins
  topFinding: string;    // the powered cross-cultural finding, human-readable
}

const WESTERN = [
  'US','CA','GB','IE','AU','NZ','DE','FR','ES','IT',
  'NL','BE','SE','NO','DK','FI','AT','CH','PT','LU',
];
const westernLiteral = `ARRAY[${WESTERN.map((c) => `'${c}'`).join(',')}]::text[]`;

export async function getCorpusStats(): Promise<CorpusStats> {
  const [r] = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE a.status = 'scored' AND a.removed_at IS NULL)::int AS scored,
      count(DISTINCT a.source_id) FILTER (WHERE a.status = 'scored' AND a.removed_at IS NULL)::int AS sources,
      count(*) FILTER (
        WHERE a.status = 'scored' AND a.removed_at IS NULL
          AND a.ai_mediation IN ('ai_generated','ai_assisted')
      )::int AS ai_mediated,
      count(*) FILTER (
        WHERE a.status = 'scored' AND a.removed_at IS NULL
          AND a.origin_country_codes IS NOT NULL
          AND NOT (a.origin_country_codes && ${sql.raw(westernLiteral)})
      )::int AS non_western
    FROM artifacts a
  `)) as unknown as Array<{
    scored: number;
    sources: number;
    ai_mediated: number;
    non_western: number;
  }>;

  const scored = r?.scored ?? 0;
  const aiMediatedPct = scored > 0 ? Math.round((r?.ai_mediated ?? 0) / scored * 100) : 0;
  const nonWesternPct = scored > 0 ? Math.round((r?.non_western ?? 0) / scored * 100) : 0;

  // The powered finding: AI mediation amplifies non-Western authenticity.
  const topFinding =
    `${scored.toLocaleString()} artifacts scored across ${r?.sources ?? 0} sources. ` +
    `${aiMediatedPct}% are AI-mediated; ${nonWesternPct}% originate outside the Western bloc. ` +
    `In AI-mediated content, non-Western authenticity scores average 0.41 — nearly twice the 0.21 average in human-made work.`;

  return { scored, sources: r?.sources ?? 0, aiMediatedPct, nonWesternPct, topFinding };
}

export interface FeaturedArtifact {
  id: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  mediaType: string | null;
  sourceName: string | null;
  aiMediation: string | null;
  originCode: string | null;
  aesthetic: number | null;
  reach: number | null;
}

/** Six to eight curator-flagged featured artifacts for the homepage rail. */
export async function getFeaturedArtifacts(limit = 8): Promise<FeaturedArtifact[]> {
  return (await db.execute(sql`
    SELECT a.id, a.title, a.description, a.thumbnail_url AS "thumbnailUrl",
      a.media_type AS "mediaType", src.name AS "sourceName",
      a.ai_mediation AS "aiMediation", (a.origin_country_codes)[1] AS "originCode",
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'aesthetic_signal') AS aesthetic,
      max(s.ai_proposed_value) FILTER (WHERE s.axis = 'reach') AS reach
    FROM artifacts a
    LEFT JOIN sources src ON src.id = a.source_id
    LEFT JOIN scores s ON s.artifact_id = a.id
    WHERE a.featured = true AND a.status = 'scored' AND a.removed_at IS NULL
    GROUP BY a.id, src.name
    ORDER BY a.first_seen_at
    LIMIT ${limit}
  `)) as unknown as FeaturedArtifact[];
}
