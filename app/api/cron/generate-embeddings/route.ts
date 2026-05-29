import { embedPendingArtifacts } from '@/lib/ai/embed-artifacts';
import { type NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '../_lib/verify-cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const summary = await embedPendingArtifacts();
  return NextResponse.json({ ok: true, ...summary });
}
