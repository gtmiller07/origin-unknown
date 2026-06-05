import { db } from '@/lib/db/client';
import { artifacts, sources } from '@/lib/db/schema';
/**
 * Search + filter over the scored corpus (Phase 7 /search). Full-text runs against the search_vector
 * generated column (title weight A + description weight B — the indexed depth; transcripts/full media
 * text are not captured), via websearch_to_tsquery, ranked by ts_rank. Facets filter by media type,
 * AI-mediation, authorship class, origin region (Western / non-Western), and language code. With no
 * query it returns the most-recent scored artifacts.
 */
import { type SQL, and, desc, eq, isNull, sql } from 'drizzle-orm';

const WESTERN = [
  'US',
  'CA',
  'GB',
  'IE',
  'AU',
  'NZ',
  'DE',
  'FR',
  'ES',
  'IT',
  'NL',
  'BE',
  'SE',
  'NO',
  'DK',
  'FI',
  'AT',
  'CH',
  'PT',
  'LU',
];
const westernLiteral = `ARRAY[${WESTERN.map((c) => `'${c}'`).join(',')}]::text[]`;

export interface SearchParams {
  q?: string;
  media?: string;
  ai?: string;
  authorship?: string;
  region?: string;
  lang?: string;
}

export interface SearchResult {
  id: string;
  title: string | null;
  description: string | null;
  mediaType: string | null;
  sourceName: string | null;
  aiMediation: string | null;
  authorshipClass: string | null;
  originCode: string | null;
}

export async function searchArtifacts(p: SearchParams, limit = 60): Promise<SearchResult[]> {
  const conds: SQL[] = [eq(artifacts.status, 'scored'), isNull(artifacts.removedAt)];
  const q = p.q?.trim();
  if (q) conds.push(sql`${artifacts.searchVector} @@ websearch_to_tsquery('english', ${q})`);
  if (p.media) conds.push(eq(artifacts.mediaType, p.media));
  if (p.ai) conds.push(eq(artifacts.aiMediation, p.ai));
  if (p.authorship) conds.push(eq(artifacts.authorshipClass, p.authorship));
  if (p.lang?.trim()) {
    conds.push(sql`${artifacts.languageCodes} && ARRAY[${p.lang.trim()}]::text[]`);
  }
  if (p.region === 'western') {
    conds.push(sql`${artifacts.originCountryCodes} && ${sql.raw(westernLiteral)}`);
  } else if (p.region === 'non_western') {
    conds.push(
      sql`${artifacts.originCountryCodes} IS NOT NULL AND NOT (${artifacts.originCountryCodes} && ${sql.raw(westernLiteral)})`
    );
  }

  const order = q
    ? desc(sql`ts_rank(${artifacts.searchVector}, websearch_to_tsquery('english', ${q}))`)
    : desc(artifacts.firstSeenAt);

  return db
    .select({
      id: artifacts.id,
      title: artifacts.title,
      description: artifacts.description,
      mediaType: artifacts.mediaType,
      sourceName: sources.name,
      aiMediation: artifacts.aiMediation,
      authorshipClass: artifacts.authorshipClass,
      originCode: sql<string | null>`(${artifacts.originCountryCodes})[1]`,
    })
    .from(artifacts)
    .leftJoin(sources, eq(artifacts.sourceId, sources.id))
    .where(and(...conds))
    .orderBy(order)
    .limit(limit);
}
