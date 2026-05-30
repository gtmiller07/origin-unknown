import { scorePendingArtifacts } from '@/lib/scoring/score-artifacts';
import { type NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '../_lib/verify-cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
