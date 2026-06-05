'use client';

/**
 * Global error boundary (Phase 8) — the last resort if a root layout itself throws. It replaces the
 * whole document, so it must render its own <html>/<body> and cannot rely on the next/font variables;
 * it falls back to system serif while keeping the palette.
 */
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: '#fafaf8',
          color: '#171717',
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}
      >
        <section style={{ maxWidth: '640px', margin: '0 auto', padding: '8rem 2rem' }}>
          <p
            style={{
              fontFamily: 'monospace',
              fontSize: '0.72rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#b85c3b',
              margin: '0 0 1.25rem',
            }}
          >
            Fatal error
          </p>
          <h1
            style={{
              fontStyle: 'italic',
              fontWeight: 300,
              fontSize: '2.5rem',
              lineHeight: 1.1,
              margin: '0 0 1rem',
            }}
          >
            The instrument failed to load
          </h1>
          <p
            style={{
              fontSize: '1.0625rem',
              lineHeight: 1.75,
              maxWidth: '52ch',
              margin: '0 0 1.75rem',
            }}
          >
            A fatal error occurred while rendering the page.
            {error.digest ? ` (ref: ${error.digest})` : ''}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              fontFamily: 'monospace',
              fontSize: '0.74rem',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#fafaf8',
              background: '#171717',
              border: '1px solid #171717',
              padding: '0.6rem 1.2rem',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </section>
      </body>
    </html>
  );
}
