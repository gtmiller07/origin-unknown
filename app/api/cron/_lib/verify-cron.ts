import { NextRequest, NextResponse } from 'next/server';

export function verifyCronAuth(req: NextRequest): NextResponse | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  return null;
}
