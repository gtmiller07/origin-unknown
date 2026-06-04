import styles from '@/app/admin/admin.module.css';
import { RestoreButton } from '@/components/admin/RestoreButton';
import { Thumbnail } from '@/components/evidence/Thumbnail';
import { displayTitle } from '@/lib/queries/artifact';
import { getRemovedArtifacts } from '@/lib/queries/vetting';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Removed' };
export const dynamic = 'force-dynamic';

function day(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export default async function Page() {
  const removed = await getRemovedArtifacts();

  return (
    <div className={styles.vetWrap}>
      <div className={styles.queueHead}>
        <h1>Removed artifacts</h1>
        <p className={styles.lede}>
          Soft-deleted records — hidden from the public corpus, field, tunnel, and search, but kept
          in the database with their full scoring history. Restoring returns an item to the public
          site and back into the vetting queue. {removed.length} removed.
        </p>
      </div>

      {removed.length === 0 ? (
        <p className={styles.empty}>Nothing has been removed.</p>
      ) : (
        <ol className={styles.queueList}>
          {removed.map((item) => (
            <li key={item.id}>
              <div className={styles.removedRow}>
                <Thumbnail
                  src={item.thumbnailUrl}
                  alt=""
                  imgClassName={styles.queueThumb}
                  emptyClassName={styles.queueThumbEmpty}
                  emptyLabel="no preview"
                />
                <div className={styles.queueBody}>
                  <p className={styles.queueTitle}>{displayTitle(item.title, item.description)}</p>
                  <div className={styles.queueMeta}>
                    <span>{item.sourceName ?? 'unknown source'}</span>
                    <span>removed {day(item.removedAt)}</span>
                    {item.removedByName ? <span>by {item.removedByName}</span> : null}
                  </div>
                  {item.removedReason ? (
                    <p className={styles.removedReason}>“{item.removedReason}”</p>
                  ) : null}
                </div>
                <RestoreButton artifactId={item.id} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
