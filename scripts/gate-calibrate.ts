// Type-only import: fully erased at compile time, so it never evaluates the module
// (and never opens the DB client) before useScriptDatabaseUrl() runs.
import type { TriageRow } from '../lib/scoring/relevance-gate';
/**
 * Calibrate the relevance gate's Haiku exclusion threshold (step 2) against the
 * hand-labeled relevance_calibration set. Two phases:
 *
 *   classify  run Haiku (the PRODUCTION prompt + instruction) over every labeled
 *             artifact not yet classified, storing haiku_relevant / haiku_confidence
 *             / haiku_reasoning / haiku_model so the confusion matrix is
 *             reproducible from the DB. SPENDS (~$0.001/artifact). Cost-capped.
 *   report    sweep the exclusion threshold over the stored verdicts vs the human
 *             labels; print precision / recall / exclusion-rate per threshold and
 *             recommend the most aggressive threshold that still clears the recall
 *             target (default 0.95 — a false exclusion is permanent). No spend.
 *
 *   npm run gate:calibrate -- classify
 *   npm run gate:calibrate -- report [--target=0.95]
 *   npm run gate:calibrate                       # classify then report
 *
 * "Positive" = human_relevant true (the artifact we must not lose). recall is
 * monotonic in the threshold, so the recommendation is the smallest threshold
 * achieving the target recall — maximizing exclusions (Opus cost saved) subject to
 * the recall floor.
 */
import { useScriptDatabaseUrl } from './db-env';

const DEFAULT_TARGET_RECALL = 0.95;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

async function runClassify() {
  const { db } = await import('../lib/db/client');
  const { eq, isNull } = await import('drizzle-orm');
  const { artifacts, relevanceCalibration, sources } = await import('../lib/db/schema');
  const { isCapped } = await import('../lib/cost/caps');
  const { classifyRelevance } = await import('../lib/ai/haiku');
  const { RELEVANCE_SYSTEM_PROMPT, RelevanceResultSchema, buildTriageInstruction, logTriageCall } =
    await import('../lib/scoring/relevance-gate');

  const targets = await db
    .select({
      calibId: relevanceCalibration.id,
      id: artifacts.id,
      title: artifacts.title,
      description: artifacts.description,
      contentUrl: artifacts.contentUrl,
      thumbnailUrl: artifacts.thumbnailUrl,
      mediaType: artifacts.mediaType,
      languageCodes: artifacts.languageCodes,
      originCountryCodes: artifacts.originCountryCodes,
      publishedAt: artifacts.publishedAt,
      isAiGenerated: artifacts.isAiGenerated,
      aiGenerationMetadata: artifacts.aiGenerationMetadata,
      externalId: artifacts.externalId,
      sourceName: sources.name,
      sourceCategory: sources.category,
      sourceNotes: sources.notes,
    })
    .from(relevanceCalibration)
    .innerJoin(artifacts, eq(relevanceCalibration.artifactId, artifacts.id))
    .leftJoin(sources, eq(artifacts.sourceId, sources.id))
    .where(isNull(relevanceCalibration.classifiedAt));

  if (targets.length === 0) {
    console.log('No unclassified labeled artifacts. (Run `gate:label import` first, or all done.)');
    return;
  }

  console.log(`Classifying ${targets.length} labeled artifact(s) with Haiku...`);
  let done = 0;
  let costUsd = 0;
  for (const row of targets) {
    if (await isCapped('anthropic')) {
      console.log('\n  Anthropic cost cap reached — stopping early.');
      break;
    }
    const triageRow: TriageRow = {
      id: row.id,
      title: row.title,
      description: row.description,
      contentUrl: row.contentUrl,
      thumbnailUrl: row.thumbnailUrl,
      mediaType: row.mediaType,
      languageCodes: row.languageCodes,
      originCountryCodes: row.originCountryCodes,
      publishedAt: row.publishedAt,
      isAiGenerated: row.isAiGenerated,
      aiGenerationMetadata: row.aiGenerationMetadata,
      externalId: row.externalId,
      sourceName: row.sourceName,
      sourceCategory: row.sourceCategory,
      sourceNotes: row.sourceNotes,
    };
    const startedAt = Date.now();
    let call: Awaited<ReturnType<typeof classifyRelevance>>;
    try {
      call = await classifyRelevance(RELEVANCE_SYSTEM_PROMPT, buildTriageInstruction(triageRow));
    } catch (err) {
      console.warn(`  classify error on ${row.id}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    costUsd += call.usage.costUsd;
    await logTriageCall({
      artifactId: row.id,
      inputTokens: call.usage.inputTokens,
      outputTokens: call.usage.outputTokens,
      costUsd: call.usage.costUsd,
      durationMs: Date.now() - startedAt,
      status: 'success',
      operation: 'relevance_calibrate',
    });
    const parsed = RelevanceResultSchema.safeParse(call.toolInput);
    if (!parsed.success) {
      console.warn(`  malformed verdict on ${row.id}: ${parsed.error.message.slice(0, 120)}`);
      continue;
    }
    await db
      .update(relevanceCalibration)
      .set({
        haikuCulturalRelevant: parsed.data.cultural_relevant,
        haikuCulturalConfidence: clamp01(parsed.data.cultural_confidence).toFixed(2),
        haikuAiOrAmbiguous: parsed.data.ai_or_ambiguous,
        haikuAiConfidence: clamp01(parsed.data.ai_confidence).toFixed(2),
        haikuKeep: parsed.data.keep,
        haikuReasoning: parsed.data.signal,
        haikuModel: call.model,
        classifiedAt: new Date().toISOString(),
      })
      .where(eq(relevanceCalibration.id, row.calibId));
    done += 1;
  }
  console.log(`Classified ${done} artifact(s) (~$${costUsd.toFixed(4)}).`);
}

async function runReport(target: number) {
  const { db } = await import('../lib/db/client');
  const { and, isNotNull } = await import('drizzle-orm');
  const { relevanceCalibration } = await import('../lib/db/schema');
  const { decideInclusion } = await import('../lib/scoring/relevance-gate');

  const rows = await db
    .select({
      human: relevanceCalibration.humanRelevant,
      culRel: relevanceCalibration.haikuCulturalRelevant,
      culConf: relevanceCalibration.haikuCulturalConfidence,
      aiAmb: relevanceCalibration.haikuAiOrAmbiguous,
      aiConf: relevanceCalibration.haikuAiConfidence,
      modelKeep: relevanceCalibration.haikuKeep,
    })
    .from(relevanceCalibration)
    .where(
      and(
        isNotNull(relevanceCalibration.haikuCulturalRelevant),
        isNotNull(relevanceCalibration.haikuCulturalConfidence),
        isNotNull(relevanceCalibration.haikuAiOrAmbiguous),
        isNotNull(relevanceCalibration.haikuAiConfidence)
      )
    );

  if (rows.length === 0) {
    console.log('No classified calibration rows. Run `gate:calibrate classify` first.');
    return;
  }

  const labeled = rows.map((r) => ({
    human: Boolean(r.human),
    verdict: {
      culturalRelevant: Boolean(r.culRel),
      culturalConfidence: Number(r.culConf),
      aiOrAmbiguous: Boolean(r.aiAmb),
      aiConfidence: Number(r.aiConf),
    },
    modelKeep: r.modelKeep === null ? null : Boolean(r.modelKeep),
  }));
  const positives = labeled.filter((r) => r.human).length;
  const negatives = labeled.length - positives;

  console.log(
    `\nCalibration set: ${labeled.length} labeled+classified  (${positives} relevant / ${negatives} not relevant)`
  );
  console.log(`Target recall: ${(target * 100).toFixed(0)}%  (a false exclusion is permanent)`);

  // How the verdicts distribute across the two judgments — where keeps come from.
  const culturalOnly = labeled.filter(
    (r) => r.verdict.culturalRelevant && !r.verdict.aiOrAmbiguous
  ).length;
  const aiOnly = labeled.filter(
    (r) => !r.verdict.culturalRelevant && r.verdict.aiOrAmbiguous
  ).length;
  const both = labeled.filter((r) => r.verdict.culturalRelevant && r.verdict.aiOrAmbiguous).length;
  const neither = labeled.filter(
    (r) => !r.verdict.culturalRelevant && !r.verdict.aiOrAmbiguous
  ).length;
  console.log(
    `Verdict axes:  cultural-only ${culturalOnly}   ai/ambiguous-only ${aiOnly}   both ${both}   neither ${neither}  (only the ${neither} 'neither' rows are drop-eligible)`
  );

  // Untuned baseline: the model's own keep call (Judgment A OR B as it saw them).
  if (labeled.every((r) => r.modelKeep !== null)) {
    let tp = 0;
    let fn = 0;
    let fp = 0;
    let tn = 0;
    for (const r of labeled) {
      const include = r.modelKeep === true;
      if (r.human && include) tp += 1;
      else if (r.human && !include) fn += 1;
      else if (!r.human && include) fp += 1;
      else tn += 1;
    }
    const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
    const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    const exclRate = (fn + tn) / labeled.length;
    console.log(
      `Model keep (untuned):  recall ${(recall * 100).toFixed(1)}%  precision ${(precision * 100).toFixed(1)}%  F1 ${f1.toFixed(2)}  excl ${(exclRate * 100).toFixed(1)}%  (TP ${tp} FN ${fn} FP ${fp} TN ${tn})`
    );
  }

  console.log('\n  thresh   recall   precision   F1     excl%   TP  FN  FP  TN');
  console.log('  ------   ------   ---------   ----   -----   --  --  --  --');

  const thresholds: number[] = [];
  for (let t = 0.5; t <= 1.0001; t += 0.05) thresholds.push(Number(t.toFixed(2)));

  let recommended: number | null = null;
  for (const t of thresholds) {
    let tp = 0;
    let fn = 0;
    let fp = 0;
    let tn = 0;
    for (const r of labeled) {
      const include = decideInclusion(r.verdict, t);
      if (r.human && include) tp += 1;
      else if (r.human && !include) fn += 1;
      else if (!r.human && include) fp += 1;
      else tn += 1;
    }
    const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
    const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    const exclRate = (fn + tn) / labeled.length;
    if (recommended === null && recall >= target) recommended = t;
    const star = recommended === t ? ' <-- recommended' : '';
    console.log(
      `  ${t.toFixed(2)}     ${(recall * 100).toFixed(1).padStart(5)}%   ${(precision * 100).toFixed(1).padStart(6)}%   ${f1.toFixed(2)}   ${(exclRate * 100).toFixed(1).padStart(4)}%   ${String(tp).padStart(2)}  ${String(fn).padStart(2)}  ${String(fp).padStart(2)}  ${String(tn).padStart(2)}${star}`
    );
  }

  console.log('');
  if (recommended === null) {
    console.log(
      `No threshold in [0.50, 1.00] reaches ${(target * 100).toFixed(0)}% recall. Use 1.00 (max recall — only excludes when BOTH judgments are not-relevant at full confidence) and revisit the prompt, or lower the target.`
    );
  } else {
    console.log(
      `Recommended exclude threshold: ${recommended.toFixed(2)}  (smallest threshold clearing ${(target * 100).toFixed(0)}% recall — most Opus spend saved at that recall floor).`
    );
    console.log(
      `Run triage with it:  npm run gate -- --only=triage --threshold=${recommended.toFixed(2)}`
    );
  }
}

async function main() {
  useScriptDatabaseUrl();
  const mode = process.argv[2] ?? null;
  const targetFlag = process.argv.find((a) => a.startsWith('--target='));
  const target = targetFlag ? Number(targetFlag.split('=')[1]) : DEFAULT_TARGET_RECALL;
  if (!Number.isFinite(target) || target <= 0 || target > 1) {
    throw new Error('--target must be in (0, 1], e.g. --target=0.95');
  }

  if (mode === 'classify') {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
    await runClassify();
  } else if (mode === 'report') {
    await runReport(target);
  } else if (mode === null) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
    await runClassify();
    await runReport(target);
  } else {
    throw new Error('Usage: npm run gate:calibrate -- [classify|report] [--target=0.95]');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
