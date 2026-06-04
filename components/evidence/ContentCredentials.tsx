/**
 * ContentCredentials — for AI artifacts only. Renders a Content Credentials (C2PA) badge that
 * expands to any provenance assertions captured at ingest (ai_generation_metadata) plus training-data
 * notes. Where assertions or training documentation are absent, that absence is stated explicitly —
 * undisclosed provenance is itself a finding under the dissertation question, not a blank to hide.
 */
import type { Artifact } from '@/lib/db/schema';
import styles from './evidence.module.css';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function ContentCredentials({
  artifact,
  trainingDataNotes,
}: {
  artifact: Artifact;
  trainingDataNotes: string | null;
}) {
  const isAi =
    artifact.isAiGenerated === true ||
    artifact.aiMediation === 'ai_generated' ||
    artifact.aiMediation === 'ai_assisted';
  if (!isAi) return null;

  const meta = isPlainObject(artifact.aiGenerationMetadata) ? artifact.aiGenerationMetadata : null;
  const entries = meta
    ? Object.entries(meta)
        .filter(
          ([, v]) => (typeof v === 'string' || typeof v === 'number') && String(v).trim() !== ''
        )
        .slice(0, 8)
    : [];

  return (
    <details className={styles.cc}>
      <summary>
        <span className={styles.ccBadge}>Content Credentials</span>
        provenance &amp; training data
      </summary>
      <div className={styles.ccBody}>
        {entries.length ? (
          entries.map(([k, v]) => (
            <div key={k} className={styles.ccRow}>
              <span className={styles.ccKey}>{k}</span>
              <span>{String(v).slice(0, 200)}</span>
            </div>
          ))
        ) : (
          <p className={styles.empty}>
            No C2PA / provenance assertions were attached by the platform.
          </p>
        )}
      </div>
      <p className={styles.trainNotes}>
        {trainingDataNotes ??
          'Training corpus, model weights, and known biases for this artifact’s generator are not publicly documented. The absence is recorded as evidence.'}
      </p>
    </details>
  );
}
