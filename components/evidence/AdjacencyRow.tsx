/**
 * AdjacencyRow — six nearest neighbours by cosine similarity over the 1,536-dim embeddings
 * (pgvector HNSW), with an expandable explanation of what "adjacent" means. Proximity is semantic,
 * not curatorial; each card links into that artifact's own evidence panel. Thumbnails use a plain
 * <img>: external UGC hosts are not next/image-optimizable.
 */
import { type AdjacentArtifact, displayTitle } from '@/lib/queries/artifact';
import { Thumbnail } from './Thumbnail';
import styles from './evidence.module.css';

export function AdjacencyRow({ items }: { items: AdjacentArtifact[] }) {
  if (!items.length) {
    return (
      <p className={styles.empty}>
        No adjacent artifacts found — this one sits alone in the embedding space so far.
      </p>
    );
  }
  return (
    <div>
      <div className={styles.adjGrid}>
        {items.map((a) => (
          <a key={a.id} href={`/artifact/${a.id}`} className={styles.adjCard}>
            <div className={styles.adjThumb}>
              <Thumbnail
                src={a.thumbnailUrl}
                alt={displayTitle(a.title, a.description, 8)}
                imgClassName={styles.adjThumbImg}
                emptyClassName={styles.adjThumbEmpty}
                emptyLabel={a.mediaType ?? 'no media'}
              />
            </div>
            <p className={styles.adjTitle}>{displayTitle(a.title, a.description, 8)}</p>
            <span className={styles.adjMeta}>
              {Math.round(a.similarity * 100)}% · {a.aiMediation ?? '—'}
            </span>
          </a>
        ))}
      </div>
      <details className={styles.why}>
        <summary>Why these are adjacent</summary>
        <p className={styles.whyText}>
          Adjacency is cosine similarity between 1,536-dimension embeddings of each artifact’s text
          and metadata (OpenAI text-embedding-3-small), retrieved through a pgvector HNSW index.
          Proximity reflects semantic and descriptive likeness — subject, register, provenance
          language — not a curatorial judgment. The percentage is each neighbour’s similarity to the
          artifact above.
        </p>
      </details>
    </div>
  );
}
