'use client';

import {
  fbBody,
  fbButton,
  fbEyebrow,
  fbHeading,
  fbLinkSpaced,
  fbSection,
} from '@/app/_components/fallback-styles';
/**
 * Public route-group error boundary (Phase 8). Catches render/data errors in any public route and
 * shows a designed fallback with a retry, instead of a raw Next.js error overlay.
 */
import { useEffect } from 'react';

export default function PublicError({
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
    <section style={fbSection}>
      <p style={fbEyebrow}>Something broke</p>
      <h1 style={fbHeading}>The instrument hit an error</h1>
      <p style={fbBody}>
        This view failed to load. The corpus and the rest of the instrument are unaffected — try
        again, or return to the start.
        {error.digest ? ` (ref: ${error.digest})` : ''}
      </p>
      <button type="button" style={fbButton} onClick={() => reset()}>
        Try again
      </button>
      <a href="/" style={fbLinkSpaced}>
        ← Origin Unknown
      </a>
    </section>
  );
}
