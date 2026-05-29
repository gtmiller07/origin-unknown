import { type NextRequest, NextResponse } from 'next/server';

export function verifyCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  // Fail closed: when the secret is unset, deny every request instead of
  // comparing against the literal `Bearer undefined`, which would otherwise let
  // anyone authenticate by sending exactly that header.
  if (!secret) {
    return new NextResponse('Service Unavailable', { status: 503 });
  }
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  return null;
}
