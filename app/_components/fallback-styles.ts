import type { CSSProperties } from 'react';

/**
 * Shared inline styles for the Phase 8 fallback states (error / not-found / loading). Mirrors the
 * coming-soon.tsx precedent of inline styles so these system pages inherit the --font-* variables
 * from whichever root layout owns them without depending on the mid-refactor globals.css. They use
 * the museum-archive palette directly.
 */
export const fbSection: CSSProperties = {
  maxWidth: '640px',
  margin: '0 auto',
  padding: 'clamp(4rem, 12vh, 9rem) clamp(1.5rem, 5vw, 4rem)',
};
export const fbEyebrow: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.72rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#b85c3b',
  margin: '0 0 1.25rem',
};
export const fbHeading: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontWeight: 300,
  fontStyle: 'italic',
  fontSize: 'clamp(2rem, 5vw, 3rem)',
  lineHeight: 1.1,
  letterSpacing: '-0.01em',
  color: '#171717',
  margin: '0 0 1rem',
};
export const fbBody: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: '1.0625rem',
  lineHeight: 1.75,
  color: '#171717',
  margin: '0 0 1.75rem',
  maxWidth: '52ch',
};
export const fbNote: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontStyle: 'italic',
  fontSize: '1rem',
  lineHeight: 1.75,
  color: '#737373',
  margin: 0,
};
export const fbButton: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.74rem',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#fafaf8',
  background: '#171717',
  border: '1px solid #171717',
  padding: '0.6rem 1.2rem',
  cursor: 'pointer',
};
export const fbLink: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.72rem',
  letterSpacing: '0.03em',
  color: '#737373',
};
export const fbLinkSpaced: CSSProperties = { ...fbLink, marginLeft: '1.25rem' };
