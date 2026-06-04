'use client';

/**
 * Legend — decodes the field's visual grammar and switches its layout. The encoding (and the
 * caption explaining what the shape means + how it evolves) changes with the layout: "origin"
 * clusters geographically; "diplomatic" places each point by its scores so position is meaning.
 */
import type { FieldLayout } from './AmbientField';
import styles from './ambient.module.css';

export function Legend({
  layout,
  onLayoutChange,
}: {
  layout: FieldLayout;
  onLayoutChange: (l: FieldLayout) => void;
}) {
  return (
    <div className={styles.legend}>
      <div className={styles.legendToggle}>
        <button
          type="button"
          className={`${styles.legendToggleBtn} ${layout === 'origin' ? styles.legendToggleActive : ''}`}
          onClick={() => onLayoutChange('origin')}
        >
          Origin
        </button>
        <button
          type="button"
          className={`${styles.legendToggleBtn} ${layout === 'diplomatic' ? styles.legendToggleActive : ''}`}
          onClick={() => onLayoutChange('diplomatic')}
        >
          Diplomatic space
        </button>
      </div>

      {layout === 'diplomatic' ? (
        <ul className={styles.legendList}>
          <li className={styles.legendItem}>
            <span className={styles.legendKey}>x · y · z</span>
            <span className={styles.legendVal}>reach · authenticity · cross-boundary</span>
          </li>
          <li className={styles.legendItem}>
            <span className={styles.legendKey}>colour</span>
            <span className={styles.legendVal}>
              <span className={styles.swW} aria-hidden="true" /> Western{' '}
              <span className={styles.swN} aria-hidden="true" /> non-Western
            </span>
          </li>
          <li className={styles.legendItem}>
            <span className={styles.legendKey}>size</span>
            <span className={styles.legendVal}>aesthetic</span>
          </li>
          <li className={styles.legendItem}>
            <span className={styles.legendKey}>glow</span>
            <span className={styles.legendVal}>diplomatic effect</span>
          </li>
        </ul>
      ) : (
        <ul className={styles.legendList}>
          <li className={styles.legendItem}>
            <span className={styles.legendKey}>position</span>
            <span className={styles.legendVal}>origin region</span>
          </li>
          <li className={styles.legendItem}>
            <span className={styles.legendKey}>colour</span>
            <span className={styles.legendVal}>
              <span className={styles.legendRamp} aria-hidden="true" /> aesthetic
            </span>
          </li>
          <li className={styles.legendItem}>
            <span className={styles.legendKey}>size</span>
            <span className={styles.legendVal}>reach</span>
          </li>
          <li className={styles.legendItem}>
            <span className={styles.legendKey}>glow</span>
            <span className={styles.legendVal}>diplomatic effect</span>
          </li>
        </ul>
      )}

      <p className={styles.legendCaption}>
        {layout === 'diplomatic'
          ? 'Position is the score: the cloud reveals where AI-mediated culture concentrates — a low-reach, reciprocity-poor mass with a high-authenticity, non-Western tail. It sharpens toward the true distribution as more artifacts are scored.'
          : 'Clustered by declared origin; proximity is shared region. The shape is the corpus’s geographic spread, rebalancing toward non-Western as cross-cultural scoring grows.'}
      </p>
      <p className={styles.legendHint}>drag to rotate · scroll to zoom · hover a point</p>
    </div>
  );
}
