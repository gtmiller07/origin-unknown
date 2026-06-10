import { scorePendingArtifacts } from '@/lib/scoring/score-artifacts';
import { type NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '../_lib/verify-cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One Opus scoring call is ~46s (max ~51s observed). At maxDuration=60 a single
// artifact fit but left no margin, and ?limit>1 guaranteed a 504. The cron now calls
// this with limit=1 and DRAIN-LOOPS it in GitHub Actions for volume; 120s gives a
// comfortable margin for one artifact. (Pro allows up to 300.) Do NOT raise the
// effective per-call limit past what fits here — volume comes from looping, not from
// a bigger per-call batch.
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  // Optional ?limit= override, clamped to a sane range. Defaults inside the job.
  const limitParam = req.nextUrl.searchParams.get('limit');
  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : Number.NaN;
  const limit = Number.isFinite(parsedLimit) ? Math.min(50, Math.max(1, parsedLimit)) : undefined;

  const summary = await scorePendingArtifacts(limit ? { limit } : {});
  return NextResponse.json({ ok: true, ...summary });
}
