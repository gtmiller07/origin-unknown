import { embedPendingArtifacts } from '@/lib/ai/embed-artifacts';
import { type NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '../_lib/verify-cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The embed batch is OpenAI calls (~1-2s/batch of 100) + per-row vector writes. The
// per-row sequential writes dominate, so a 500-row run could cross the old 60s ceiling
// and 504. The cron now passes a smaller ?limit and DRAIN-LOOPS this in GitHub Actions
// to clear the backlog; 120s gives margin per call. (Pro allows up to 300.)
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  // Optional ?limit= override, clamped. Defaults inside the job (500).
  const limitParam = req.nextUrl.searchParams.get('limit');
  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : Number.NaN;
  const limit = Number.isFinite(parsedLimit) ? Math.min(1000, Math.max(1, parsedLimit)) : undefined;

  const summary = await embedPendingArtifacts(limit ? { limit } : {});
  return NextResponse.json({ ok: true, ...summary });
}
