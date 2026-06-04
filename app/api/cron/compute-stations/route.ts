import { computeStationDensities } from '@/lib/stations/compute';
import { type NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '../_lib/verify-cron';
/**
 * Recomputes era-station artifact densities (Stage B). Cheap, read-mostly; safe to run daily.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const stations = await computeStationDensities();
  return NextResponse.json({ ok: true, stations });
}
