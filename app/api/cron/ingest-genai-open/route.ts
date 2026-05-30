import { fetchHuggingFaceArtifacts } from '@/lib/ingestion/huggingface';
import { ingestCategory } from '@/lib/ingestion/run';
import { type NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '../_lib/verify-cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const results = await ingestCategory('genai_open_api', fetchHuggingFaceArtifacts);
  const artifactsIngested = results.reduce((total, r) => total + r.ingested, 0);
  return NextResponse.json({
    ok: true,
    sources: results.length,
    artifactsIngested,
    results,
  });
}
