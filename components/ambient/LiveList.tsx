/**
 * Live feed, list view (/live?view=list) — the accessible, WebGL-free fallback for the ambient field.
 * Recent scored artifacts with their headline axis values, newest first.
 */
import type { LiveItem, LiveStatus } from '@/lib/queries/ambient';
import styles from './ambient.module.css';

const fmt = (n: number | null): string => (n == null ? '—' : n.toFixed(2));

function label(it: LiveItem): string {
  if (it.title?.trim()) return it.title;
  if (it.description?.trim()) {
    const d = it.description.trim();
    return d.length > 80 ? `${d.slice(0, 79)}…` : d;
  }
  return 'Untitled artifact';
}

export function LiveList({ items, status }: { items: LiveItem[]; status: LiveStatus }) {
  return (
    <div className={styles.listPage}>
      <p className={styles.eyebrow}>Live · list view</p>
      <h1 className={styles.listTitle}>The field, as a list</h1>
      <p className={styles.listStatus}>
        <span className={styles.hudNum}>{status.scored.toLocaleString()}</span> scored ·{' '}
        <span className={styles.hudNum}>{status.artifacts.toLocaleString()}</span> ingested ·{' '}
        {status.sources} sources · <a href="/live">ambient field →</a>
      </p>

      {items.length === 0 ? (
        <p className={styles.listStatus}>No scored artifacts yet.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((it) => (
            <li key={it.id} className={styles.listRow}>
              <a className={styles.listLink} href={`/artifact/${it.id}`}>
                {label(it)}
              </a>
              <span className={styles.listMeta}>
                {[it.sourceName, it.mediaType, it.aiMediation].filter(Boolean).join(' · ')}
              </span>
              <span className={styles.listScores}>
                aes {fmt(it.aesthetic)} · reach {fmt(it.reach)} · dipl {fmt(it.diplomatic)}
              </span>
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
