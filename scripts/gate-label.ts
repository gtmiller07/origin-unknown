/**
 * Calibration labeling for the relevance gate (step 2). The Haiku exclusion
 * threshold is only trustworthy if tuned against human ground truth, so this
 * script exports a stratified sample of AMBIGUOUS artifacts for hand-labeling,
 * then imports the labels into the relevance_calibration table (migration 0012).
 *
 * File-based (not interactive) so labeling can happen at the labeler's pace in an
 * editor and the file is itself a reviewable research artifact:
 *
 *   npm run gate:label -- export [count] [path]            # uniform unlabeled sample
 *   npm run gate:label -- stratified [count] [path] [--pool=N]  # classify-first, boundary-rich
 *   # ...open the JSON, set each "human_relevant" to true or false, add notes...
 *   npm run gate:label -- import [path]                    # upsert labels into relevance_calibration
 *
 * `stratified` (the gold-standard set for the two-axis gate) classifies a larger
 * candidate pool with the production prompt READ-ONLY (no gate writes), buckets by
 * the two-axis verdict, and oversamples the recall-critical regions — the
 * drop-eligible boundary (both judgments not-relevant, near the threshold) and the
 * AI/ambiguous-only rows (kept by Judgment B alone, the most-damaging-error zone).
 * It spends ~$0.001/pool-artifact; the verdict is written into a `_haiku` field per
 * row for transparency (ignored on import).
 *
 * The sample is stratified across the ambiguous sources (round-robin by a
 * deterministic md5 rank), excludes anything already labeled, and reflects the
 * true platform mix so the measured recall is meaningful.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
// Type-only imports: fully erased at compile time, so they never evaluate the
// module (and never open the DB client) before useScriptDatabaseUrl() runs.
import type { RelevanceResult, TriageRow } from '../lib/scoring/relevance-gate';
import { useScriptDatabaseUrl } from './db-env';

const DEFAULT_COUNT = 60;
const DEFAULT_PATH = './gate-calibration.json';
/** Candidate pool size for `stratified`: classified read-only, then sampled down. */
const DEFAULT_POOL = 200;

interface LabelRow {
  artifact_id: string;
  title: string | null;
  description: string | null;
  media_type: string | null;
  source: string | null;
  content_url: string | null;
  /** Set this by hand: true = relevant, false = not relevant. */
  human_relevant: boolean | null;
  human_notes: string;
}

async function runExport(count: number, path: string) {
  const { db } = await import('../lib/db/client');
  const { sql } = await import('drizzle-orm');

  const rows = await db.execute(sql`
    WITH ranked AS (
      SELECT a.id, a.title, a.description, a.content_url, a.media_type,
             s.name AS source_name, s.category AS source_category,
             row_number() OVER (PARTITION BY a.source_id ORDER BY md5(a.id::text)) AS rn,
             md5(a.id::text) AS h
      FROM artifacts a
      LEFT JOIN sources s ON s.id = a.source_id
      WHERE a.status = 'pending'
        AND a.embedding IS NOT NULL
        AND (a.ai_mediation = 'unknown' OR a.ai_mediation IS NULL)
        AND NOT EXISTS (SELECT 1 FROM relevance_calibration rc WHERE rc.artifact_id = a.id)
    )
    SELECT id, title, description, content_url, media_type, source_name, source_category
    FROM ranked
    ORDER BY rn, h
    LIMIT ${count}
  `);

  const out: LabelRow[] = (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    artifact_id: String(r.id),
    title: r.title === null ? null : String(r.title),
    description:
      r.description === null ? null : String(r.description).replace(/\s+/g, ' ').slice(0, 800),
    media_type: r.media_type === null ? null : String(r.media_type),
    source: r.source_name ? `${String(r.source_name)} (${String(r.source_category ?? '?')})` : null,
    content_url: r.content_url === null ? null : String(r.content_url),
    human_relevant: null,
    human_notes: '',
  }));

  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`Exported ${out.length} unlabeled artifact(s) to ${path}.`);
  console.log('Set each "human_relevant" to true or false, then: npm run gate:label -- import');
}

async function runImport(path: string) {
  const { db } = await import('../lib/db/client');
  const { relevanceCalibration } = await import('../lib/db/schema');

  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${path} is not a JSON array.`);

  let imported = 0;
  let skipped = 0;
  const nowIso = new Date().toISOString();
  for (const raw of parsed) {
    const row = raw as Partial<LabelRow>;
    if (typeof row.artifact_id !== 'string' || typeof row.human_relevant !== 'boolean') {
      skipped += 1;
      continue;
    }
    await db
      .insert(relevanceCalibration)
      .values({
        artifactId: row.artifact_id,
        humanRelevant: row.human_relevant,
        humanNotes: row.human_notes ? String(row.human_notes) : null,
        labeledAt: nowIso,
      })
      .onConflictDoUpdate({
        target: relevanceCalibration.artifactId,
        set: {
          humanRelevant: row.human_relevant,
          humanNotes: row.human_notes ? String(row.human_notes) : null,
          labeledAt: nowIso,
        },
      });
    imported += 1;
  }
  console.log(
    `Imported ${imported} label(s) into relevance_calibration${skipped ? `, skipped ${skipped} without a boolean human_relevant` : ''}.`
  );
}

/** The classifier's read-only verdict, attached to each stratified row for context. */
interface HaikuPreview {
  cultural_relevant: boolean;
  cultural_confidence: number;
  ai_or_ambiguous: boolean;
  ai_confidence: number;
  keep: boolean;
  signal: string;
  bucket: string;
}

/**
 * Bucket a verdict for stratified sampling. Only the 'neither' rows (both judgments
 * not-relevant) are drop-eligible, and recall misses live among them; they split by
 * drop margin = min(confidences) into the near-threshold boundary vs. confident
 * drops. ai_only (kept by Judgment B alone) is the most-damaging-error zone.
 */
function bucketOf(v: RelevanceResult): string {
  if (v.cultural_relevant && v.ai_or_ambiguous) return 'both';
  if (v.cultural_relevant) return 'cultural_only';
  if (v.ai_or_ambiguous) return 'ai_only';
  const margin = Math.min(v.cultural_confidence, v.ai_confidence);
  return margin >= 0.9 ? 'confident_drop' : 'drop_boundary';
}

async function runStratified(count: number, poolSize: number, path: string) {
  // Don't clobber a file that already holds hand labels (e.g. the pilot set).
  if (existsSync(path)) {
    const existing = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (
      Array.isArray(existing) &&
      existing.some((r) => {
        const hr = (r as Partial<LabelRow>).human_relevant;
        return hr === true || hr === false;
      })
    ) {
      throw new Error(
        `${path} already holds hand-labeled rows — refusing to overwrite. Pass a different path, e.g.: npm run gate:label -- stratified ${count} ./gate-calibration-stratified.json`
      );
    }
  }

  const { db } = await import('../lib/db/client');
  const { sql } = await import('drizzle-orm');
  const { isCapped } = await import('../lib/cost/caps');
  const { classifyRelevance } = await import('../lib/ai/haiku');
  const { RELEVANCE_SYSTEM_PROMPT, RelevanceResultSchema, buildTriageInstruction, logTriageCall } =
    await import('../lib/scoring/relevance-gate');

  const raw = await db.execute(sql`
    WITH ranked AS (
      SELECT a.id, a.title, a.description, a.content_url, a.thumbnail_url, a.media_type,
             a.language_codes, a.origin_country_codes, a.published_at,
             a.is_ai_generated, a.ai_generation_metadata, a.external_id,
             s.name AS source_name, s.category AS source_category, s.notes AS source_notes,
             row_number() OVER (PARTITION BY a.source_id ORDER BY md5(a.id::text)) AS rn,
             md5(a.id::text) AS h
      FROM artifacts a
      LEFT JOIN sources s ON s.id = a.source_id
      WHERE a.status = 'pending'
        AND a.embedding IS NOT NULL
        AND (a.ai_mediation = 'unknown' OR a.ai_mediation IS NULL)
        AND NOT EXISTS (SELECT 1 FROM relevance_calibration rc WHERE rc.artifact_id = a.id)
    )
    SELECT * FROM ranked ORDER BY rn, h LIMIT ${poolSize}
  `);

  const poolRows = raw as unknown as Array<Record<string, unknown>>;
  if (poolRows.length === 0) {
    console.log(
      'No unlabeled ambiguous artifacts to sample. (All labeled, or none pending+embedded.)'
    );
    return;
  }

  const toIso = (v: unknown): string | null =>
    v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v);
  const orNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

  const pool: TriageRow[] = poolRows.map((r) => ({
    id: String(r.id),
    title: orNull(r.title),
    description: orNull(r.description),
    contentUrl: orNull(r.content_url),
    thumbnailUrl: orNull(r.thumbnail_url),
    mediaType: orNull(r.media_type),
    languageCodes: Array.isArray(r.language_codes) ? (r.language_codes as string[]) : null,
    originCountryCodes: Array.isArray(r.origin_country_codes)
      ? (r.origin_country_codes as string[])
      : null,
    publishedAt: toIso(r.published_at),
    isAiGenerated:
      r.is_ai_generated === null || r.is_ai_generated === undefined
        ? null
        : Boolean(r.is_ai_generated),
    aiGenerationMetadata: r.ai_generation_metadata ?? null,
    externalId: String(r.external_id),
    sourceName: orNull(r.source_name),
    sourceCategory: orNull(r.source_category),
    sourceNotes: orNull(r.source_notes),
  }));

  console.log(
    `Classifying a ${pool.length}-artifact pool with Haiku (read-only, no gate writes) to find boundary-rich rows...`
  );

  const scored: Array<{ row: TriageRow; v: RelevanceResult; bucket: string }> = [];
  let costUsd = 0;
  let failed = 0;
  let capped = false;
  for (const tr of pool) {
    if (await isCapped('anthropic')) {
      capped = true;
      console.log('  Anthropic cost cap reached — stopping classification early.');
      break;
    }
    const startedAt = Date.now();
    let call: Awaited<ReturnType<typeof classifyRelevance>>;
    try {
      call = await classifyRelevance(RELEVANCE_SYSTEM_PROMPT, buildTriageInstruction(tr));
    } catch (err) {
      failed += 1;
      console.warn(`  classify error on ${tr.id}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    costUsd += call.usage.costUsd;
    await logTriageCall({
      artifactId: tr.id,
      inputTokens: call.usage.inputTokens,
      outputTokens: call.usage.outputTokens,
      costUsd: call.usage.costUsd,
      durationMs: Date.now() - startedAt,
      status: 'success',
      operation: 'relevance_calibrate_export',
    });
    const parsed = RelevanceResultSchema.safeParse(call.toolInput);
    if (!parsed.success) {
      failed += 1;
      continue;
    }
    scored.push({ row: tr, v: parsed.data, bucket: bucketOf(parsed.data) });
  }

  console.log(
    `Classified ${scored.length} (failed ${failed}${capped ? ', capped' : ''}) ~$${costUsd.toFixed(4)}.`
  );
  if (scored.length === 0) {
    console.log('Nothing classified — not writing a file.');
    return;
  }

  // Oversample the recall-critical regions; the rest fill the remaining budget.
  const targets: Record<string, number> = {
    ai_only: Math.round(count * 0.17), // kept by Judgment B alone — most-damaging-error zone
    drop_boundary: Math.round(count * 0.37), // near the threshold — recall misses live here
    confident_drop: Math.round(count * 0.2), // confident true-negative candidates
    cultural_only: Math.round(count * 0.13),
    both: Math.round(count * 0.13),
  };
  const byBucket = new Map<string, typeof scored>();
  for (const s of scored) {
    const list = byBucket.get(s.bucket) ?? [];
    list.push(s);
    byBucket.set(s.bucket, list);
  }
  for (const list of byBucket.values()) list.sort((a, b) => (a.row.id < b.row.id ? -1 : 1));

  const selected: typeof scored = [];
  const selectedIds = new Set<string>();
  for (const [bucket, want] of Object.entries(targets)) {
    for (const s of (byBucket.get(bucket) ?? []).slice(0, want)) {
      if (!selectedIds.has(s.row.id)) {
        selected.push(s);
        selectedIds.add(s.row.id);
      }
    }
  }
  if (selected.length < count) {
    const remaining = scored
      .filter((s) => !selectedIds.has(s.row.id))
      .sort((a, b) => (a.row.id < b.row.id ? -1 : 1));
    for (const s of remaining) {
      if (selected.length >= count) break;
      selected.push(s);
      selectedIds.add(s.row.id);
    }
  }
  if (selected.length > count) selected.length = count;

  const out = selected.map((s) => {
    const preview: HaikuPreview = {
      cultural_relevant: s.v.cultural_relevant,
      cultural_confidence: s.v.cultural_confidence,
      ai_or_ambiguous: s.v.ai_or_ambiguous,
      ai_confidence: s.v.ai_confidence,
      keep: s.v.keep,
      signal: s.v.signal,
      bucket: s.bucket,
    };
    return {
      artifact_id: s.row.id,
      title: s.row.title,
      description:
        s.row.description === null ? null : s.row.description.replace(/\s+/g, ' ').slice(0, 800),
      media_type: s.row.mediaType,
      source: s.row.sourceName ? `${s.row.sourceName} (${s.row.sourceCategory ?? '?'})` : null,
      content_url: s.row.contentUrl,
      human_relevant: null as boolean | null,
      human_notes: '',
      _haiku: preview,
    };
  });

  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  const dist = [...byBucket.entries()]
    .map(([b, l]) => `${b} ${selected.filter((s) => s.bucket === b).length}/${l.length}`)
    .join('  ');
  console.log(`Wrote ${out.length} boundary-rich row(s) to ${path}.`);
  console.log(`Sampled / available by bucket:  ${dist}`);
  console.log(
    `Set each "human_relevant" to true/false (the _haiku field is the classifier's read-only verdict), then: npm run gate:label -- import ${path}`
  );
}

async function main() {
  useScriptDatabaseUrl();
  const mode = process.argv[2];
  if (mode === 'export') {
    const maybeCount = Number.parseInt(process.argv[3] ?? '', 10);
    const count = Number.isFinite(maybeCount) && maybeCount > 0 ? maybeCount : DEFAULT_COUNT;
    const path =
      process.argv[3] && !Number.isFinite(maybeCount)
        ? process.argv[3]
        : (process.argv[4] ?? DEFAULT_PATH);
    await runExport(count, path);
  } else if (mode === 'stratified') {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
    const positional = process.argv.slice(3).filter((a) => !a.startsWith('--'));
    const numeric = positional.find((a) => /^\d+$/.test(a));
    const nonNumeric = positional.find((a) => !/^\d+$/.test(a));
    const count = numeric ? Math.max(1, Number.parseInt(numeric, 10)) : DEFAULT_COUNT;
    const path = nonNumeric ?? DEFAULT_PATH;
    const poolFlag = process.argv.find((a) => a.startsWith('--pool='));
    const poolParsed = poolFlag ? Number.parseInt(poolFlag.split('=')[1] ?? '', 10) : Number.NaN;
    const pool = Math.max(
      count,
      Number.isFinite(poolParsed) && poolParsed > 0 ? poolParsed : DEFAULT_POOL
    );
    await runStratified(count, pool, path);
  } else if (mode === 'import') {
    const path = process.argv[3] ?? DEFAULT_PATH;
    await runImport(path);
  } else {
    throw new Error(
      'Usage: npm run gate:label -- export [count] [path]  |  stratified [count] [path] [--pool=N]  |  import [path]'
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
