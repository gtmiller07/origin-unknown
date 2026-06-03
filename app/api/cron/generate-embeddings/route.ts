import { embedPendingArtifacts } from '@/lib/ai/embed-artifacts';
import { type NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '../_lib/verify-cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Allow the embed batch (OpenAI calls + per-row vector writes; ~25-40s for a full
// run) to finish instead of hitting Vercel's short default timeout and returning a
// 504. 60s is valid on every plan (Hobby caps here; Pro allows up to 300).
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const summary = await embedPendingArtifacts();
  return NextResponse.json({ ok: true, ...summary });
}
