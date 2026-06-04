/**
 * Public route-group loading state (Phase 8). Shown while a server component fetches from the corpus
 * (the dynamic pages re-fetch per request), so navigation feels responsive rather than blank.
 */
import { fbEyebrow, fbNote, fbSection } from '@/app/_components/fallback-styles';

export default function Loading() {
  return (
    <section style={fbSection}>
      <p style={fbEyebrow}>Loading</p>
      <p style={fbNote}>Retrieving from the corpus…</p>
    </section>
  );
}
