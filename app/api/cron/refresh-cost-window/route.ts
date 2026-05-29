import { refreshCostWindows } from '@/lib/cost/caps';
import { type NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '../_lib/verify-cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const caps = await refreshCostWindows();
  return NextResponse.json({ ok: true, caps });
}
