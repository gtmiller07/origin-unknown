import { db } from '@/lib/db/client';
import { curators } from '@/lib/db/schema';
import { createClient } from '@/lib/supabase/server';
import { eq } from 'drizzle-orm';
import { JetBrains_Mono, Source_Serif_4 } from 'next/font/google';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import '@/app/globals.css';

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  weight: ['300', '400', '600'],
  style: ['normal', 'italic'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500'],
});

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // /admin/login is nested under this layout, so applying the auth guard to it would
  // redirect the login page to itself in an infinite loop. Exempt it: render a bare
  // shell (no nav, no guard). The pathname is forwarded by middleware as x-pathname.
  const pathname = (await headers()).get('x-pathname') ?? '';
  if (pathname === '/admin/login') {
    return (
      <html lang="en" className={`${sourceSerif.variable} ${jetbrainsMono.variable}`}>
        <body>
          <main style={{ padding: '2rem' }}>{children}</main>
        </body>
      </html>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/admin/login');
  }

  const curator = await db.query.curators.findFirst({
    where: eq(curators.userId, user.id),
  });

  if (!curator || !curator.isActive) {
    redirect('/admin/login');
  }

  return (
    <html lang="en" className={`${sourceSerif.variable} ${jetbrainsMono.variable}`}>
      <body>
        <nav
          style={{
            padding: '1rem 2rem',
            borderBottom: '1px solid #737373',
            display: 'flex',
            gap: '1.5rem',
            flexWrap: 'wrap',
          }}
        >
          <a
            href="/admin/queue"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: '#737373',
              textDecoration: 'none',
            }}
          >
            Queue
          </a>
          <a
            href="/admin/artifacts"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: '#737373',
              textDecoration: 'none',
            }}
          >
            Artifacts
          </a>
          <a
            href="/admin/sources"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: '#737373',
              textDecoration: 'none',
            }}
          >
            Sources
          </a>
          <a
            href="/admin/notes"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: '#737373',
              textDecoration: 'none',
            }}
          >
            Notes
          </a>
          <a
            href="/admin/cost-controls"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: '#737373',
              textDecoration: 'none',
            }}
          >
            Cost
          </a>
          <a
            href="/admin/operational-mode"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: '#737373',
              textDecoration: 'none',
            }}
          >
            Mode
          </a>
          <a
            href="/"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: '#737373',
              textDecoration: 'none',
              marginLeft: 'auto',
            }}
          >
            ← Site
          </a>
        </nav>
        <main style={{ padding: '2rem' }}>{children}</main>
      </body>
    </html>
  );
}
