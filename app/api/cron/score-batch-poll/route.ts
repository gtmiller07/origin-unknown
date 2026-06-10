import { pollAndIngestBatches } from '@/lib/scoring/batch-score';
import { type NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '../_lib/verify-cron';
/**
 * Poll open Message Batches and ingest results from any that have ended. Each succeeded result is
 * persisted through the same persistScoringResult helper the synchronous path uses; errored/expired
 * requests return their artifact to the queue. Spend is logged at the 50% batch rate so the cost cap
 * accrues. Returns `scanned` (running batches) so the workflow can keep polling. Runs hourly.
 *
 * Note: a single ingest streams a whole batch's results; for very large batches this can be long,
 * so 120s ceiling + the workflow's drain-loop (which re-invokes until nothing is running).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A single ingest streams a whole batch's results (≤~500/batch given the budget reserve) and
// persists each; ~100–150s typical. 300s (Pro) gives margin so we don't 504 mid-ingest.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const summary = await pollAndIngestBatches();
  // `scanned` lets the workflow drain-loop stop when no batches remain in flight.
  return NextResponse.json({ ok: true, scanned: summary.stillRunning, ...summary });
}
