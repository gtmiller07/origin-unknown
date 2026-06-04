/**
 * /takedown — the public removal-request route. Reads an optional ?artifact={id} (set by the
 * evidence panel's takedown link) and prefills it into the form. Submissions land in
 * takedown_requests for curator review.
 */
import type { Metadata } from 'next';
import styles from '../transparency.module.css';
import { TakedownForm } from './TakedownForm';

export const metadata: Metadata = {
  title: 'Takedown',
  description: 'Request the removal of an artifact from the Origin Unknown corpus.',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TakedownPage({
  searchParams,
}: {
  searchParams: Promise<{ artifact?: string }>;
}) {
  const { artifact } = await searchParams;
  const artifactId = typeof artifact === 'string' && UUID.test(artifact) ? artifact : '';

  return (
    <div className={styles.page}>
      <p className={styles.eyebrow}>Takedown</p>
      <h1 className={styles.h1}>Request a removal</h1>
      <p className={styles.lead}>
        If you are depicted in an artifact, hold rights to it, or have another well-founded
        objection, request its removal here. Requests route to a curator and are acted on.
      </p>

      <div className={styles.prose}>
        <p>
          The instrument studies publicly-posted cultural artifacts and links to their original
          source rather than rehosting them where rights require. A takedown removes the artifact
          and its scores from the public corpus. Provide enough detail for a curator to identify the
          content and your relationship to it.
        </p>
      </div>

      {artifactId ? <p className={styles.artifactRef}>Referenced artifact: {artifactId}</p> : null}

      <TakedownForm artifactId={artifactId} />

      <a className={styles.back} href="/">
        ← Origin Unknown
      </a>
    </div>
  );
}
