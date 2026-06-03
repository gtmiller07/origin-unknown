import { fetchRedditArtifacts } from '@/lib/ingestion/reddit';
import { ingestCategory } from '@/lib/ingestion/run';
import { type NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '../_lib/verify-cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Raise the function ceiling above Vercel's short default so a full batch (upstream
// API/model I/O + DB writes) finishes instead of returning a 504. 60s is valid on
// every plan (Hobby caps here; Pro allows up to 300).
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const results = await ingestCategory('reddit', fetchRedditArtifacts);
  const artifactsIngested = results.reduce((total, r) => total + r.ingested, 0);
  return NextResponse.json({
    ok: true,
    sources: results.length,
    artifactsIngested,
    results,
  });
}
