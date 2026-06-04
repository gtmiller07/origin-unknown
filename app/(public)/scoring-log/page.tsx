import { listRecentScoringEvents } from '@/lib/queries/transparency';
/**
 * /scoring-log — the instrument's recent activity: the latest axis-level proposals, each with the
 * evidence the scorer named. A public, auditable record of how the corpus is being read.
 */
import type { Metadata } from 'next';
import styles from '../transparency.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Scoring log',
  description: 'A public, auditable record of the instrument’s recent scoring activity.',
};

const AXIS_LABELS: Record<string, string> = {
  origin: 'Origin',
  reach: 'Reach',
  aesthetic_signal: 'Aesthetic',
  diplomatic_cross_boundary: 'Cross-boundary',
  diplomatic_authenticity: 'Authenticity',
  diplomatic_reciprocity: 'Reciprocity',
};

function fmtTime(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toISOString().slice(0, 16).replace('T', ' ');
}
function snippet(s: string | null, n = 200): string | null {
  if (!s) return null;
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export default async function ScoringLogPage() {
  const events = await listRecentScoringEvents(60);

  return (
    <div className={`${styles.page} ${styles.wide}`}>
      <p className={styles.eyebrow}>Transparency</p>
      <h1 className={styles.h1}>Scoring log</h1>
      <p className={styles.lead}>
        The instrument&rsquo;s recent activity — the latest axis-level proposals, each with the
        evidence the scorer named. Newest first; proposals are machine-generated and unreviewed
        unless confirmed by a curator.
      </p>

      {events.length === 0 ? (
        <p className={styles.versionNotes}>No scoring activity recorded yet.</p>
      ) : (
        <ul className={styles.log}>
          {events.map((e, i) => (
            <li key={`${e.artifactId}-${e.axis}-${i}`} className={styles.logRow}>
              <span className={styles.logTime}>{fmtTime(e.createdAt)}</span>
              <span className={styles.logAxis}>
                {AXIS_LABELS[e.axis] ?? e.axis}
                {e.newValue != null ? (
                  <>
                    {' '}
                    <span className={styles.logVal}>{Number(e.newValue).toFixed(2)}</span>
                  </>
                ) : null}
              </span>
              <div className={styles.logMain}>
                <span className={styles.logTitle}>
                  {e.artifactId ? (
                    <a href={`/artifact/${e.artifactId}`}>
                      {e.artifactTitle ?? 'Untitled artifact'}
                    </a>
                  ) : (
                    (e.artifactTitle ?? 'Untitled artifact')
                  )}
                </span>
                {snippet(e.reasoning) ? (
                  <p className={styles.logReason}>{snippet(e.reasoning)}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <a className={styles.back} href="/">
        ← Origin Unknown
      </a>
    </div>
  );
}
