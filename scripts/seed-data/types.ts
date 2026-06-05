import type { AxisKey } from '../../lib/queries/artifact';
/**
 * Shape of a curated seed-corpus artifact. Values are typed to the DB CHECK constraints
 * (0001_schema_constraints.sql, 0010_add_authorship_taxonomy.sql) so an invalid enum can't compile.
 * Draft scores are authored as defensible starting points and loaded as proposals
 * (ai_proposed_value, ai_model='seed_corpus_draft') pending human confirmation in the vetting queue.
 */

export type MediaType = 'image' | 'video' | 'audio' | 'text' | 'mixed';

export type AiMediation = 'human_made' | 'ai_assisted' | 'ai_generated' | 'unknown';

export type AuthorshipClass =
  | 'individual_creator'
  | 'community_collective'
  | 'commercial_institutional'
  | 'state_affiliated'
  | 'ambiguous_unattributable';

export interface SeedScore {
  axis: AxisKey;
  /** 0..1 */
  value: number;
  /** One-line draft reasoning, author's-voice, refined later in vetting. */
  reasoning: string;
}

export interface SeedArtifact {
  /** Unique slug within the seed source (the upsert key with sourceId). */
  externalId: string;
  title: string;
  /** 1–3 sentence context: what it is and why it bears on the question. */
  description: string;
  /** Stable canonical URL (YouTube ID, Wikipedia, official/museum page). Becomes content_url. */
  url: string;
  thumbnailUrl?: string | null;
  /** If set (and thumbnailUrl is not), the loader derives a stable YouTube thumbnail from this id.
   *  The loader also auto-extracts an id from a YouTube `url`, so this is only needed when `url`
   *  points elsewhere (e.g. Wikipedia) but a canonical YouTube video exists. */
  youtubeId?: string;
  mediaType: MediaType;
  /** ISO date (YYYY-MM-DD). Drives tunnel Z-placement; use the real publication/launch date. */
  publishedAt: string;
  /** ISO country codes; drives Western/non-Western tunnel placement. */
  originCountryCodes: string[];
  aiMediation?: AiMediation | null;
  authorshipClass?: AuthorshipClass | null;
  /** Defaults to true (these are chosen for relevance). */
  bearsOnDissertation?: boolean;
  /** Era label, e.g. '1998–2005'. */
  era: string;
  /** Exactly the six axes. */
  scores: SeedScore[];
}
