import { Thumbnail } from '@/components/evidence/Thumbnail';
import { displayTitle, listRecentScored } from '@/lib/queries/artifact';
/**
 * /corpus — a browse grid of recently scored artifacts, each linking into its evidence panel. This
 * is the reachable entry into the corpus before the tunnel (Phase 5) lands; it is deliberately plain
 * (a contact sheet, not a feed) so the instrument's output, not an algorithm, orders what you see.
 */
import type { Metadata } from 'next';
import styles from './corpus.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Corpus',
  description: 'Browse scored artifacts in the Origin Unknown corpus.',
};

export default async function CorpusPage() {
  const items = await listRecentScored(48);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>The corpus</h1>
        <p className={styles.sub}>
          Recently scored artifacts. Each opens an evidence panel — provenance, six-axis scoring
          with reasoning, interrogative questions, and adjacency.
        </p>
      </header>

      {items.length === 0 ? (
        <p className={styles.empty}>No scored artifacts yet. The instrument is still warming up.</p>
      ) : (
        <ul className={styles.grid}>
          {items.map((a) => (
            <li key={a.id}>
              <a className={styles.card} href={`/artifact/${a.id}`}>
                <div className={styles.thumb}>
                  <Thumbnail
                    src={a.thumbnailUrl}
                    alt={displayTitle(a.title, a.description)}
                    imgClassName={styles.thumbImg}
                    emptyClassName={styles.thumbEmpty}
                    emptyLabel={a.mediaType ?? 'no media'}
                  />
                </div>
                <p className={styles.cardTitle}>{displayTitle(a.title, a.description)}</p>
                <span className={styles.cardMeta}>
                  {[a.sourceName, a.aiMediation, a.originCountryCodes?.[0]]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
