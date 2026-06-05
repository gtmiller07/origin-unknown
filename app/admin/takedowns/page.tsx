import styles from '@/app/admin/admin.module.css';
import { TakedownActions } from '@/components/admin/TakedownActions';
import { displayTitle } from '@/lib/queries/artifact';
import { getTakedownRequests } from '@/lib/queries/governance';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Takedown requests' };
export const dynamic = 'force-dynamic';

function day(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export default async function Page() {
  const rows = await getTakedownRequests();
  const pending = rows.filter((r) => r.status === 'pending').length;

  return (
    <div className={styles.vetWrap}>
      <div className={styles.queueHead}>
        <h1>Takedown requests</h1>
        <p className={styles.lede}>
          Removal requests from people depicted in, or holding rights to, an artifact. Honoring one
          soft-deletes the artifact (hidden everywhere, reversible from Removed); declining records
          the decision. {pending} pending.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className={styles.empty}>No takedown requests have been submitted.</p>
      ) : (
        <ol className={styles.govList}>
          {rows.map((r) => (
            <li
              key={r.id}
              className={r.status === 'pending' ? styles.govCard : `${styles.govCard} ${styles.govResolved}`}
            >
              <div className={styles.govHead}>
                <span className={styles.govStatus} data-status={r.status}>
                  {r.status}
                </span>
                <span className={styles.govDate}>{day(r.createdAt)}</span>
              </div>
              {r.artifactId ? (
                <p className={styles.govArtifact}>
                  <a href={`/artifact/${r.artifactId}`} target="_blank" rel="noreferrer noopener">
                    {displayTitle(r.artifactTitle, null)}
                  </a>
                  {r.artifactRemovedAt ? <span className={styles.govFlag}> · already hidden</span> : null}
                </p>
              ) : (
                <p className={styles.govArtifact}>
                  No artifact linked — the request names a URL in its reasoning.
                </p>
              )}
              <dl className={styles.govMeta}>
                <div>
                  <dt>From</dt>
                  <dd>{r.requesterEmail}</dd>
                </div>
                <div>
                  <dt>Relationship</dt>
                  <dd>{r.requesterRelationship}</dd>
                </div>
              </dl>
              <p className={styles.govReason}>{r.reasoning}</p>
              {r.status === 'pending' ? (
                <TakedownActions
                  takedownId={r.id}
                  hasArtifact={!!r.artifactId}
                  alreadyRemoved={!!r.artifactRemovedAt}
                />
              ) : (
                <p className={styles.govResolution}>
                  {r.status}
                  {r.reviewedByName ? ` by ${r.reviewedByName}` : ''}
                  {r.reviewedAt ? ` · ${day(r.reviewedAt)}` : ''}
                  {r.reviewNotes ? ` — “${r.reviewNotes}”` : ''}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
