import { type NextRequest, NextResponse } from 'next/server';
/**
 * Same-origin image proxy for the tunnel's textured tiles. WebGL textures require CORS approval, and
 * most artifact-thumbnail hosts (ytimg, Mastodon/Bluesky CDNs, …) don't send it — so we fetch the
 * image server-side and re-serve it from our own origin. SSRF guard: https only, private/loopback
 * hosts blocked, image content-type + size enforced, short timeout. The `url` values come from our
 * own corpus (artifacts.thumbnail_url), not arbitrary user input. Cached hard since thumbnails are
 * effectively immutable.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BLOCKED_HOST = /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1$|\[?::1)/i;

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('url');
  if (!target) return new NextResponse('Missing url', { status: 400 });

  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return new NextResponse('Malformed url', { status: 400 });
  }
  if (u.protocol !== 'https:') return new NextResponse('https only', { status: 400 });
  if (BLOCKED_HOST.test(u.hostname)) return new NextResponse('Blocked host', { status: 400 });

  try {
    const upstream = await fetch(u.toString(), {
      headers: { 'user-agent': 'OriginUnknown/1.0 (thumbnail proxy)', accept: 'image/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) return new NextResponse('Upstream error', { status: 502 });
    const ct = upstream.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return new NextResponse('Not an image', { status: 415 });
    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > 6_000_000) return new NextResponse('Too large', { status: 413 });
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'content-type': ct,
        'cache-control': 'public, max-age=86400, s-maxage=604800, immutable',
        'access-control-allow-origin': '*',
      },
    });
  } catch {
    return new NextResponse('Fetch failed', { status: 502 });
  }
}
