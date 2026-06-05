'use client';

/**
 * HoverCard — the floating scorecard shown when a particle is hovered: the artifact's thumbnail, its
 * tags, and a six-axis mini-bar reading of its scores. Positioned near the cursor, clamped to the
 * viewport. Display-only (pointer-events: none); the click that opens the artifact is handled on the
 * particle itself.
 */
import { Thumbnail } from '@/components/evidence/Thumbnail';
import type { Particle, ParticleAxes } from '@/lib/queries/ambient';
import styles from './ambient.module.css';

const AXES: Array<[keyof ParticleAxes, string]> = [
  ['origin', 'Origin'],
  ['reach', 'Reach'],
  ['aesthetic_signal', 'Aesthetic'],
  ['diplomatic_cross_boundary', 'Cross-bound.'],
  ['diplomatic_authenticity', 'Authenticity'],
  ['diplomatic_reciprocity', 'Reciprocity'],
];

const CARD_W = 264;
const CARD_H = 320;

export function HoverCard({ particle, x, y }: { particle: Particle; x: number; y: number }) {
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const left = Math.max(12, Math.min(x + 18, vw - CARD_W - 12));
  const top = Math.max(12, Math.min(y + 18, vh - CARD_H - 12));
  const title = particle.title?.trim() || 'Untitled artifact';
  const tags = [particle.sourceName, particle.mediaType, particle.originCode]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={styles.card} style={{ left, top }}>
      <div className={styles.cardThumb}>
        <Thumbnail
          src={particle.thumbnailUrl}
          alt={title}
          imgClassName={styles.cardThumbImg}
          emptyClassName={styles.cardThumbEmpty}
          emptyLabel={particle.mediaType ?? 'no preview'}
        />
      </div>
      <p className={styles.cardTitle}>{title}</p>
      {tags ? <p className={styles.cardMeta}>{tags}</p> : null}
      <div className={styles.cardBars}>
        {AXES.map(([key, label]) => {
          const v = particle.axes[key];
          return (
            <div key={key} className={styles.cardBarRow}>
              <span className={styles.cardBarLabel}>{label}</span>
              <span className={styles.cardBarTrack}>
                <span
                  className={styles.cardBarFill}
                  style={{ width: `${Math.round((v ?? 0) * 100)}%` }}
                />
              </span>
              <span className={styles.cardBarVal}>{v == null ? '—' : v.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
      <p className={styles.cardHint}>click to open ↗</p>
    </div>
  );
}
