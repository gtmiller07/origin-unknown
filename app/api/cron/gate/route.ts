import {
  DEFAULT_EXCLUDE_THRESHOLD,
  classifyAmbiguousBatch,
  gateBaselineSample,
  gateChallengers,
} from '@/lib/scoring/relevance-gate';
import { type NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '../_lib/verify-cron';
/**
 * Relevance gate cron. Decides which embedded, pending artifacts are eligible for
 * Opus scoring by writing gate_decision. WITHOUT this running, freshly ingested +
 * embedded artifacts stay gate_decision = NULL forever and the scoring queue starves
 * (this was the silent cause of scoring volume collapsing once the pre-gated buffer
 * drained). Three phases, selectable via ?phase=:
 *
 *   free   (default-ish): the two zero-cost structural passes —
 *            gateChallengers (ai_generated/ai_assisted → include) and
 *            gateBaselineSample (human_made → stratified include/exclude).
 *            Run ONCE per cron cycle; idempotent (touches only ungated rows).
 *   triage: one bounded Haiku batch over the AMBIGUOUS bucket (ai_mediation
 *            unknown/NULL). Costs a little (Haiku), gated by the anthropic cost cap.
 *            The workflow loops this until scanned=0 or capped.
 *   all (default): free passes + one triage batch.
 *
 * The workflow calls ?phase=free once, then drain-loops ?phase=triage.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const TRIAGE_LIMIT = 25;

export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const phase = req.nextUrl.searchParams.get('phase') ?? 'all';
  const runFree = phase === 'free' || phase === 'all';
  const runTriage = phase === 'triage' || phase === 'all';

  const result: Record<string, unknown> = { ok: true, phase };

  if (runFree) {
    const challengers = await gateChallengers();
    const baseline = await gateBaselineSample();
    result.challengers_included = challengers.included;
    result.baseline_included = baseline.included;
    result.baseline_excluded = baseline.excluded;
  }

  if (runTriage) {
    const t = await classifyAmbiguousBatch({
      limit: TRIAGE_LIMIT,
      excludeThreshold: DEFAULT_EXCLUDE_THRESHOLD,
      maxAttempts: 2,
    });
    result.triage = {
      included: t.included,
      excluded: t.excluded,
      failed: t.failed,
      scanned: t.scanned,
      costUsd: Number(t.costUsd.toFixed(6)),
    };
    // Top-level fields the drain loop reads to decide when to stop.
    result.scanned = t.scanned; // 0 → ambiguous bucket drained
    result.capped = t.capped; // true → anthropic cap hit
  } else {
    result.scanned = 0; // free-only call: nothing to loop on
  }

  return NextResponse.json(result);
}
