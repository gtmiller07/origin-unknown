import { db } from '@/lib/db/client';
import type { Artifact, Score } from '@/lib/db/schema';
import { artifacts, evidencePanels, scores, sources } from '@/lib/db/schema';
/**
 * Read-side queries for the public evidence panel (Phase 4) and corpus browse.
 *
 * These run in React Server Components, so they import the shared postgres-js client directly.
 * Adjacency uses the pgvector cosine operator (<=>) against the hnsw(vector_cosine_ops) index
 * (migration 0006); cosine similarity is reported as 1 - distance. The full 1536-dim embedding is
 * never returned to the client — only the narrow display fields below.
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

export type AxisKey =
  | 'origin'
  | 'reach'
  | 'aesthetic_signal'
  | 'diplomatic_cross_boundary'
  | 'diplomatic_authenticity'
  | 'diplomatic_reciprocity';

export type EvidencePanel = typeof evidencePanels.$inferSelect;

export interface SourceMeta {
  name: string | null;
  category: string | null;
  notes: string | null;
}

export interface AdjacentArtifact {
  id: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  mediaType: string | null;
  sourceName: string | null;
  aiMediation: string | null;
  similarity: number; // cosine similarity in [0,1]
}

export interface ArtifactDetail {
  artifact: Artifact;
  source: SourceMeta | null;
  scores: Score[];
  evidencePanel: EvidencePanel | null;
  adjacency: AdjacentArtifact[];
}

export interface CorpusCard {
  id: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  mediaType: string | null;
  sourceName: string | null;
  aiMediation: string | null;
  originCountryCodes: string[] | null;
}

/** Full evidence-panel payload for /artifact/[id]. Returns null if the id does not exist. */
export async function getArtifactDetail(id: string): Promise<ArtifactDetail | null> {
  // Removed artifacts are invisible to the public panel (returns null → the page 404s).
  const [artifact] = await db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, id), isNull(artifacts.removedAt)))
    .limit(1);
  if (!artifact) return null;

  const source: SourceMeta | null = artifact.sourceId
    ? ((
        await db
          .select({ name: sources.name, category: sources.category, notes: sources.notes })
          .from(sources)
          .where(eq(sources.id, artifact.sourceId))
          .limit(1)
      )[0] ?? null)
    : null;

  const scoreRows = await db.select().from(scores).where(eq(scores.artifactId, id));
  const [panel] = await db
    .select()
    .from(evidencePanels)
    .where(eq(evidencePanels.artifactId, id))
    .limit(1);

  // Six nearest scored neighbours by cosine distance on the hnsw index. The scalar subquery is
  // uncorrelated, so the planner evaluates it once and the index is still used for the ORDER BY.
  let adjacency: AdjacentArtifact[] = [];
  if (artifact.embedding) {
    const rows = (await db.execute(sql`
      SELECT a.id,
             a.title,
             a.thumbnail_url AS "thumbnailUrl",
             a.media_type   AS "mediaType",
             a.description  AS "description",
             a.ai_mediation AS "aiMediation",
             s.name         AS "sourceName",
             1 - (a.embedding <=> (SELECT embedding FROM artifacts WHERE id = ${id})) AS similarity
      FROM artifacts a
      LEFT JOIN sources s ON s.id = a.source_id
      WHERE a.id <> ${id}
        AND a.embedding IS NOT NULL
        AND a.status = 'scored'
        AND a.removed_at IS NULL
      ORDER BY a.embedding <=> (SELECT embedding FROM artifacts WHERE id = ${id})
      LIMIT 6
    `)) as unknown as AdjacentArtifact[];
    adjacency = rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
  }

  return { artifact, source, scores: scoreRows, evidencePanel: panel ?? null, adjacency };
}

/** Recent scored artifacts for the /corpus browse grid. */
export async function listRecentScored(limit = 48): Promise<CorpusCard[]> {
  return db
    .select({
      id: artifacts.id,
      title: artifacts.title,
      description: artifacts.description,
      thumbnailUrl: artifacts.thumbnailUrl,
      mediaType: artifacts.mediaType,
      sourceName: sources.name,
      aiMediation: artifacts.aiMediation,
      originCountryCodes: artifacts.originCountryCodes,
    })
    .from(artifacts)
    .leftJoin(sources, eq(artifacts.sourceId, sources.id))
    .where(and(eq(artifacts.status, 'scored'), isNull(artifacts.removedAt)))
    .orderBy(desc(artifacts.firstSeenAt))
    .limit(limit);
}

/**
 * Display title for an artifact: its title, else a short snippet of its description (many social
 * posts carry no title), else a neutral fallback. Keeps the corpus grid, evidence panel, and
 * adjacency cards from showing a wall of "Untitled".
 */
export function displayTitle(
  title: string | null,
  description?: string | null,
  maxWords = 12
): string {
  if (title?.trim()) return title.trim();
  const d = description?.trim();
  if (d) {
    const words = d.split(/\s+/);
    return words.length <= maxWords ? d : `${words.slice(0, maxWords).join(' ')}…`;
  }
  return 'Untitled artifact';
}
