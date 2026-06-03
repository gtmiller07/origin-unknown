import type { Metadata } from 'next';
import { JetBrains_Mono, Source_Serif_4 } from 'next/font/google';
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

export const metadata: Metadata = {
  title: {
    template: '%s — Origin Unknown',
    default: 'Origin Unknown',
  },
  description:
    'A methodological instrument for measuring AI-mediated cultural diplomacy in real time.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://originunknown.org'),
  openGraph: {
    siteName: 'Origin Unknown',
    type: 'website',
  },
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sourceSerif.variable} ${jetbrainsMono.variable}`}>
      <body>
        <nav aria-label="Site navigation" className="site-nav">
          <a href="/" className="nav-title">
            Origin Unknown
          </a>
          <div className="nav-links">
            <a href="/tunnel">Tunnel</a>
            <a href="/live">Live feed</a>
            <a href="/methodology">Methodology</a>
            <a href="/scoring-log">Scoring log</a>
            <a href="/notes">Notes</a>
            <a href="/about">About</a>
          </div>
        </nav>
        <main>{children}</main>
        <footer className="site-footer">
          <a href="/methodology">Methodology</a>
          <span className="footer-sep">·</span>
          <a href="/takedown">Takedown</a>
          <span className="footer-sep">·</span>
          <a href="/lineage">Lineage</a>
          <span className="footer-sep">·</span>
          <a href="https://github.com/gtmiller07/origin-unknown" rel="noopener noreferrer">
            Source
          </a>
        </footer>
      </body>
    </html>
  );
}
