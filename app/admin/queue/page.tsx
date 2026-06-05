import styles from '@/app/admin/admin.module.css';
import { Thumbnail } from '@/components/evidence/Thumbnail';
import { displayTitle } from '@/lib/queries/artifact';
import { getVetQueue, getVetStats } from '@/lib/queries/vetting';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Vetting Queue' };
export const dynamic = 'force-dynamic';

const DONE_MESSAGE: Record<string, string> = {
  vetted: 'Saved. That artifact is now human-confirmed.',
  removed: 'Removed. The artifact is hidden from every public surface (and reversible).',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  const { done } = await searchParams;
  const [stats, queue] = await Promise.all([getVetStats(), getVetQueue()]);
  const doneMsg = done ? DONE_MESSAGE[done] : null;

  return (
    <div className={styles.vetWrap}>
      <div className={styles.queueHead}>
        <h1>Vetting queue</h1>
        <p className={styles.lede}>
          Every score the instrument produces is a <em>proposal</em> until a curator confirms it.
          This queue is the backlog of scored artifacts awaiting that human read. Vetting one takes a
          couple of minutes and needs no prior knowledge of the project — the interview explains each
          step.
        </p>
        <div className={styles.statRow}>
          <span className={styles.stat}>
            <span className={styles.statNum}>{stats.pending}</span> awaiting vetting
          </span>
          <span className={styles.stat}>
            <span className={styles.statNum}>{stats.vetted}</span> human-confirmed
          </span>
          <span className={styles.stat}>
            <span className={styles.statNum}>{stats.removed}</span> removed
          </span>
        </div>
        {queue.length > 0 ? (
          <a className={styles.startBtn} href={`/admin/queue/${queue[0]?.id}`}>
            Start vetting →
          </a>
        ) : null}
      </div>

      {doneMsg ? <p className={styles.doneBanner}>{doneMsg}</p> : null}

      {queue.length === 0 ? (
        <p className={styles.empty}>
          The queue is clear — every scored artifact has been vetted. New items appear here as
          scoring runs.
        </p>
      ) : (
        <ol className={styles.queueList}>
          {queue.map((item) => (
            <li key={item.id}>
              <a className={styles.queueItem} href={`/admin/queue/${item.id}`}>
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
                    <span>{item.mediaType ?? '—'}</span>
                    {item.aiMediation ? <span>{item.aiMediation}</span> : null}
                    <span>{item.scoreCount}/6 axes</span>
                  </div>
                </div>
                <span className={styles.queueGo}>Vet →</span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
