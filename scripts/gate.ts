/**
 * Run the relevance gate (methodology redesign, step 2). Decides which pending,
 * embedded artifacts are eligible for Opus scoring and writes the gate_* columns.
 * Mirrors scripts/score.ts (no serverless ceiling, cost-capped, resumable).
 *
 * Phases (run all by default, or one via --only):
 *   buckets      challengers (taxonomy_prior) + baseline (baseline_sample). FREE —
 *                no API calls. Run this first to preview bucket sizes for review.
 *   challengers  just the challenger bulk-include.
 *   baseline     just the incumbent stratified sample.
 *   triage       the AMBIGUOUS bucket via Haiku (SPENDS; needs ANTHROPIC_API_KEY).
 *   similarity   compute the demoted question_similarity feature (needs OPENAI_API_KEY).
 *
 * Examples:
 *   npm run gate -- --only=buckets                  # free structural pass, for review
 *   npm run gate -- --only=triage --threshold=0.85  # spend Haiku at a tuned threshold
 *   npm run gate -- --only=triage --triage-max=200  # bound the triage spend
 *   npm run gate                                     # full pipeline (after calibration)
 *
 * Honors the anthropic cost cap (triage stops early if capped) and prints running
 * spend. Re-running is safe and resumable: only ungated rows are touched.
 */
import { useScriptDatabaseUrl } from './db-env';

const CHUNK = 25;

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=');
    flags[k] = v === undefined ? true : v;
  }
  return flags;
}

function numFlag(v: string | boolean | undefined): number | undefined {
  if (typeof v !== 'string') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric flag value "${v}"`);
  return n;
}

async function main() {
  useScriptDatabaseUrl();
  const flags = parseFlags(process.argv.slice(2));

  const only = typeof flags.only === 'string' ? flags.only : null;
  const validOnly = ['buckets', 'challengers', 'baseline', 'triage', 'similarity'];
  if (only && !validOnly.includes(only)) {
    throw new Error(`Invalid --only=${only}. One of: ${validOnly.join(', ')}`);
  }
  const threshold = numFlag(flags.threshold);
  const baselineCap = numFlag(flags['baseline-cap']);
  const triageMax = numFlag(flags['triage-max']) ?? Number.POSITIVE_INFINITY;

  const runAll = !only;
  const want = (phase: string) =>
    runAll ||
    only === phase ||
    (only === 'buckets' && (phase === 'challengers' || phase === 'baseline'));

  // Only require keys for the phases that actually call an API.
  if (want('triage') && !process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set in the environment (.env.local).');
  }
  if (want('similarity') && !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set in the environment (.env.local).');
  }

  const gate = await import('../lib/scoring/relevance-gate');

  if (want('challengers')) {
    const r = await gate.gateChallengers();
    console.log(`Challengers:  +${r.included} included (taxonomy_prior, confidence 1.00).`);
  }

  if (want('baseline')) {
    const r = await gate.gateBaselineSample(
      baselineCap !== undefined ? { capPerSource: baselineCap } : {}
    );
    console.log(
      `Baseline:     ${r.included} included / ${r.excluded} excluded (stratified, cap ${r.capPerSource}/source).`
    );
  }

  if (want('triage')) {
    console.log(
      `\nAmbiguous triage with Haiku (threshold ${threshold ?? gate.DEFAULT_EXCLUDE_THRESHOLD}, recall-biased)...`
    );
    let included = 0;
    let excluded = 0;
    let failed = 0;
    let inTok = 0;
    let outTok = 0;
    let costUsd = 0;
    const errors: string[] = [];

    while (included + excluded + failed < triageMax) {
      const remaining = triageMax - (included + excluded + failed);
      const limit = Math.min(CHUNK, remaining);
      const s = await gate.classifyAmbiguousBatch({
        limit,
        excludeThreshold: threshold,
        maxAttempts: 2,
      });
      included += s.included;
      excluded += s.excluded;
      failed += s.failed;
      inTok += s.totalInputTokens;
      outTok += s.totalOutputTokens;
      costUsd += s.costUsd;
      errors.push(...s.errors);
      console.log(
        `  +${s.included} in / +${s.excluded} out / +${s.failed} failed  |  total: ${included} in / ${excluded} out / ${failed} failed / ~$${costUsd.toFixed(4)}`
      );
      if (s.capped) {
        console.log('\n  Anthropic cost cap reached — stopping early.');
        break;
      }
      if (s.scanned === 0) {
        console.log('\n  No more ambiguous artifacts to triage.');
        break;
      }
    }
    console.log(
      `\nTriage done. ${included} included / ${excluded} excluded / ${failed} failed. Tokens: ${inTok} in / ${outTok} out (~$${costUsd.toFixed(4)}).`
    );
    if (errors.length > 0) {
      console.log(`\nTriage errors (${errors.length}):`);
      for (const e of errors.slice(0, 20)) console.log(`  - ${e}`);
    }
  }

  if (want('similarity')) {
    console.log('\nComputing demoted question_similarity feature...');
    const r = await gate.computeQuestionSimilarity();
    console.log(`Similarity:   ${r.updated} rows updated (~$${r.costUsd}).`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\nRelevance gate failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
