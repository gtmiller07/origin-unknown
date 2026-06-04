/**
 * Seed corpus loader. Upserts a single 'manual_upload' source and a curated set of historically dated
 * artifacts — the 23 Section-14 anchors plus famous per-era touchstones — each with draft six-axis
 * scores stored as proposals (ai_proposed_value, ai_model='seed_corpus_draft'). status='scored' so
 * they populate the tunnel/corpus immediately; value/human_* are left NULL so each lands in the
 * vetting queue for human confirmation. Idempotent: artifacts upsert by (source_id, external_id),
 * scores by (artifact_id, axis); a re-run refreshes drafts but never clobbers human-confirmed values
 * or vetted_at. Visibility needs no gate/embedding — run `npm run embed` afterward for adjacency.
 *   npm run seed:corpus
 */
import { eq, sql } from 'drizzle-orm';
import { useScriptDatabaseUrl } from './db-env';
import { ALL_SEED } from './seed-data';
import { THUMBNAILS } from './seed-data/thumbnails';
import type { SeedArtifact } from './seed-data/types';

const SOURCE_NAME = 'Seed Corpus (curated)';
const AXES = [
  'origin',
  'reach',
  'aesthetic_signal',
  'diplomatic_cross_boundary',
  'diplomatic_authenticity',
  'diplomatic_reciprocity',
] as const;
const MEDIA = new Set(['image', 'video', 'audio', 'text', 'mixed']);

/** A stable YouTube thumbnail (served for <img> without CORS issues), from an explicit id or a
 *  YouTube url. Returns null when neither yields an id. */
function deriveThumb(url: string, youtubeId?: string): string | null {
  const id =
    youtubeId ??
    url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/)?.[1] ??
    null;
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

function validate(items: SeedArtifact[]): void {
  const ids = new Set<string>();
  for (const a of items) {
    if (ids.has(a.externalId)) throw new Error(`Duplicate externalId: ${a.externalId}`);
    ids.add(a.externalId);
    if (!a.title?.trim() || !a.url?.trim()) throw new Error(`${a.externalId}: missing title/url`);
    if (!MEDIA.has(a.mediaType)) throw new Error(`${a.externalId}: bad mediaType ${a.mediaType}`);
    if (!/^\d{4}-\d{2}-\d{2}/.test(a.publishedAt))
      throw new Error(`${a.externalId}: bad publishedAt ${a.publishedAt}`);
    const seen = new Set(a.scores.map((s) => s.axis));
    if (seen.size !== 6 || !AXES.every((ax) => seen.has(ax)))
      throw new Error(`${a.externalId}: needs all 6 axes, has [${[...seen].join(', ')}]`);
    for (const s of a.scores) {
      if (s.value < 0 || s.value > 1)
        throw new Error(`${a.externalId}/${s.axis}: value ${s.value} out of [0,1]`);
      if (!s.reasoning?.trim()) throw new Error(`${a.externalId}/${s.axis}: empty reasoning`);
    }
  }
}

async function main() {
  validate(ALL_SEED);
  console.log(`Validated ${ALL_SEED.length} seed artifacts.`);

  useScriptDatabaseUrl();
  const { db } = await import('../lib/db/client');
  const { artifacts, scores, sources } = await import('../lib/db/schema');

  // sources has no unique constraint on name, so select-then-insert.
  let [src] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.name, SOURCE_NAME))
    .limit(1);
  if (!src) {
    [src] = await db
      .insert(sources)
      .values({
        name: SOURCE_NAME,
        category: 'manual_upload',
        config: {},
        enabled: true,
        notes:
          'Curated historical seed corpus (Section 14 anchors + famous per-era touchstones). Draft scores pending vetting.',
      })
      .returning({ id: sources.id });
  }
  if (!src) throw new Error('Could not resolve the seed source.');
  const sourceId = src.id;
  const now = new Date().toISOString();

  let artifactCount = 0;
  let scoreCount = 0;
  for (const a of ALL_SEED) {
    const [row] = await db
      .insert(artifacts)
      .values({
        sourceId,
        externalId: a.externalId,
        title: a.title,
        description: a.description,
        contentUrl: a.url,
        thumbnailUrl: a.thumbnailUrl ?? THUMBNAILS[a.externalId] ?? deriveThumb(a.url, a.youtubeId),
        mediaType: a.mediaType,
        originCountryCodes: a.originCountryCodes,
        publishedAt: a.publishedAt,
        aiMediation: a.aiMediation ?? null,
        aiMediationProvenance: a.aiMediation ? 'source_prior' : null,
        authorshipClass: a.authorshipClass ?? null,
        authorshipClassProvenance: a.authorshipClass ? 'source_prior' : null,
        bearsOnDissertationQuestion: a.bearsOnDissertation ?? true,
        status: 'scored',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [artifacts.sourceId, artifacts.externalId],
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          contentUrl: sql`excluded.content_url`,
          thumbnailUrl: sql`COALESCE(excluded.thumbnail_url, artifacts.thumbnail_url)`,
          mediaType: sql`excluded.media_type`,
          originCountryCodes: sql`excluded.origin_country_codes`,
          publishedAt: sql`excluded.published_at`,
          aiMediation: sql`excluded.ai_mediation`,
          authorshipClass: sql`excluded.authorship_class`,
          bearsOnDissertationQuestion: sql`excluded.bears_on_dissertation_question`,
          status: sql`excluded.status`,
          updatedAt: now,
        },
      })
      .returning({ id: artifacts.id });
    if (!row) throw new Error(`Upsert failed for ${a.externalId}`);
    artifactCount += 1;

    for (const s of a.scores) {
      await db
        .insert(scores)
        .values({
          artifactId: row.id,
          axis: s.axis,
          aiProposedValue: s.value.toFixed(2),
          aiReasoning: s.reasoning,
          aiModel: 'seed_corpus_draft',
          scoringPromptVersion: 'seed',
          aiProposedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [scores.artifactId, scores.axis],
          // Refresh the AI draft only; never touches human_confirmed_value.
          set: {
            aiProposedValue: sql`excluded.ai_proposed_value`,
            aiReasoning: sql`excluded.ai_reasoning`,
            aiModel: sql`excluded.ai_model`,
            aiProposedAt: sql`excluded.ai_proposed_at`,
            updatedAt: now,
          },
        });
      scoreCount += 1;
    }
  }

  console.log(`Seed source: ${sourceId}`);
  console.log(`Upserted ${artifactCount} artifacts, ${scoreCount} score rows.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
