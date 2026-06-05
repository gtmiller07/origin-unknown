import styles from '@/app/admin/admin.module.css';
import { AppealActions } from '@/components/admin/AppealActions';
import { displayTitle } from '@/lib/queries/artifact';
import { getAppeals } from '@/lib/queries/governance';
import { AXIS_GUIDES } from '@/lib/vetting/axes';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Score appeals' };
export const dynamic = 'force-dynamic';

function day(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}
function axisLabel(key: string): string {
  return AXIS_GUIDES.find((g) => g.key === key)?.label ?? key;
}

export default async function Page() {
  const rows = await getAppeals();
  const pending = rows.filter((r) => r.status === 'pending').length;

  return (
    <div className={styles.vetWrap}>
      <div className={styles.queueHead}>
        <h1>Score appeals</h1>
        <p className={styles.lede}>
          Public challenges to a specific axis score. Upholding revises the score (recorded in the
          scoring log as a human revision); rejecting keeps it (recorded as a human confirmation).{' '}
          {pending} pending.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className={styles.empty}>No appeals have been submitted.</p>
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
                </p>
              ) : (
                <p className={styles.govArtifact}>Artifact no longer exists.</p>
              )}
              <p className={styles.govAxis}>
                Axis: <strong>{axisLabel(r.axis)}</strong> · AI score{' '}
                {r.aiValue != null ? r.aiValue.toFixed(2) : '—'}
                {r.humanValue != null ? ` · human ${r.humanValue.toFixed(2)}` : ''}
              </p>
              {r.aiReasoning ? (
                <details className={styles.reasoning}>
                  <summary>The instrument’s reasoning</summary>
                  <p>{r.aiReasoning}</p>
                </details>
              ) : null}
              <p className={styles.govReason}>{r.challengerReasoning}</p>
              {r.status === 'pending' && r.artifactId ? (
                <AppealActions appealId={r.id} aiValue={r.aiValue} />
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
