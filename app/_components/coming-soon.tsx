import type { CSSProperties } from 'react';

/**
 * Shared placeholder for routes that are linked from the nav/footer/CTA but whose
 * real implementation is Phase 3 work. Renders inside whichever root layout owns the
 * route (public or admin), so it inherits the site chrome and the --font-* variables.
 * Its only job is to turn a dead link into an honest "in development" page instead of
 * a raw 404. Inline styles match the login/admin precedent and avoid touching the
 * shared globals.css (which is mid-refactor).
 */

const section: CSSProperties = {
  maxWidth: '720px',
  margin: '0 auto',
  padding: 'clamp(4rem, 10vh, 8rem) clamp(1.5rem, 5vw, 4rem)',
};

const eyebrow: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: '#737373',
  margin: '0 0 1.5rem',
};

const heading: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontWeight: 300,
  fontStyle: 'italic',
  fontSize: 'clamp(2rem, 5vw, 3.5rem)',
  lineHeight: 1.1,
  letterSpacing: '-0.02em',
  color: '#171717',
  margin: '0 0 1.5rem',
};

const bodyText: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: '1.0625rem',
  lineHeight: 1.75,
  color: '#171717',
  margin: '0 0 1rem',
};

const noteText: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontStyle: 'italic',
  fontSize: '1rem',
  lineHeight: 1.75,
  color: '#737373',
  margin: '0 0 2.5rem',
};

const back: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  letterSpacing: '0.03em',
  color: '#737373',
};

export function ComingSoon({
  title,
  blurb,
  note = 'The ingestion corpus is live and growing. This view is part of Phase 3 and is being built now.',
  backHref = '/',
  backLabel = '← Origin Unknown',
}: {
  title: string;
  blurb: string;
  note?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <section style={section}>
      <p style={eyebrow}>In development</p>
      <h1 style={heading}>{title}</h1>
      <p style={bodyText}>{blurb}</p>
      <p style={noteText}>{note}</p>
      <a href={backHref} style={back}>
        {backLabel}
      </a>
    </section>
  );
}
