import { submitScoringBatchJob } from '@/lib/scoring/batch-score';
import { type NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '../_lib/verify-cron';
/**
 * Submit ONE Message Batch of gated artifacts for bulk scoring at ~50% cost. Sized to the
 * remaining daily/monthly anthropic budget, so it respects the same $30/day cap as the
 * synchronous scorer. Submission is a single fast API call (no model I/O here); results are
 * ingested later by score-batch-poll. Runs ~1–2×/day.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  // Optional ?max= caps the batch size (else budget- and MAX_BATCH-bounded inside the job).
  const maxParam = req.nextUrl.searchParams.get('max');
  const parsed = maxParam ? Number.parseInt(maxParam, 10) : Number.NaN;
  const maxRequests = Number.isFinite(parsed) ? Math.max(1, parsed) : undefined;

  const summary = await submitScoringBatchJob(maxRequests ? { maxRequests } : {});
  return NextResponse.json({ ok: true, ...summary });
}
