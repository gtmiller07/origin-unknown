import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live https://*.sentry.io",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.supabase.co https://i.ytimg.com https://img.youtube.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.upstash.io",
  "frame-src https://www.youtube-nocookie.com https://www.tiktok.com",
  "media-src 'self' blob: https://*.supabase.co",
].join('; ');

// Mobile UA patterns for tunnel redirect
const MOBILE_UA = /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i;

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const response = NextResponse.next();

  // CSP header on all responses
  response.headers.set('Content-Security-Policy', CSP);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Mobile tunnel redirect — skip if already in flat mode
  if (pathname === '/tunnel' && !searchParams.get('mode')) {
    const ua = request.headers.get('user-agent') ?? '';
    if (MOBILE_UA.test(ua)) {
      return NextResponse.redirect(
        new URL('/tunnel?mode=flat&notice=mobile', request.url)
      );
    }
  }

  // Viewer session cookie — uses Web Crypto API (Edge-compatible)
  const sessionCookie = request.cookies.get('session_token');
  if (!sessionCookie) {
    // Generate cryptographically random 32-byte token via Web Crypto
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = btoa(String.fromCharCode(...tokenBytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Hash user-agent for storage (no PII persisted)
    const ua = request.headers.get('user-agent') ?? '';
    const uaBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ua));
    const uaHash = Array.from(new Uint8Array(uaBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);

    const country = request.headers.get('x-vercel-ip-country') ?? null;

    response.cookies.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 86400,
      path: '/',
    });

    response.cookies.set('_s_meta', JSON.stringify({ uaHash, country }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 86400,
      path: '/',
    });
  }

  // Supabase session refresh for auth routes
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
