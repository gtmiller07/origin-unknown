/**
 * Legend — decodes the field's visual grammar so a viewer can read it: position → origin region,
 * colour → aesthetic signal (with a cool→warm ramp swatch), size → reach, glow → diplomatic effect.
 */
import styles from './ambient.module.css';

export function Legend() {
  return (
    <div className={styles.legend}>
      <p className={styles.legendHead}>Reading the field</p>
      <ul className={styles.legendList}>
        <li className={styles.legendItem}>
          <span className={styles.legendKey}>position</span>
          <span className={styles.legendVal}>origin region</span>
        </li>
        <li className={styles.legendItem}>
          <span className={styles.legendKey}>colour</span>
          <span className={styles.legendVal}>
            <span className={styles.legendRamp} aria-hidden="true" /> aesthetic signal
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
      <p className={styles.legendHint}>drag to rotate · scroll to zoom · hover a point</p>
    </div>
  );
}
