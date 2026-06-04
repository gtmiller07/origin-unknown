/**
 * Public route-group 404 (Phase 8). Rendered when notFound() is called in a public route (e.g. an
 * unknown or removed artifact) or a public path doesn't match. Inherits the site chrome.
 */
import { fbBody, fbEyebrow, fbHeading, fbLink, fbSection } from '@/app/_components/fallback-styles';

export default function NotFound() {
  return (
    <section style={fbSection}>
      <p style={fbEyebrow}>404</p>
      <h1 style={fbHeading}>Not in the corpus</h1>
      <p style={fbBody}>
        This page or artifact doesn&rsquo;t exist, or has been removed — it may have been taken down
        at a rights holder&rsquo;s request.
      </p>
      <a href="/corpus" style={fbLink}>
        Browse the corpus →
      </a>
    </section>
  );
}
