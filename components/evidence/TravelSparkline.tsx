/**
 * TravelSparkline — a small temporal sparkline of an artifact's observed cross-border travel
 * (evidence_panels.travel_history). Most artifacts have no observed travel yet; that honest absence
 * is the common case and is stated plainly rather than faked.
 */
import styles from './evidence.module.css';

interface TravelPoint {
  date?: string;
  count?: number;
  value?: number;
}

export function TravelSparkline({ travelHistory }: { travelHistory: unknown }) {
  const points: number[] = Array.isArray(travelHistory)
    ? (travelHistory as TravelPoint[])
        .map((p) => Number(p?.count ?? p?.value ?? 0))
        .filter((n) => Number.isFinite(n))
    : [];

  if (points.length < 2) {
    return (
      <p className={styles.empty}>
        No cross-border travel has been observed for this artifact yet.
      </p>
    );
  }

  const max = Math.max(...points, 1);
  const w = 240;
  const h = 40;
  const step = w / (points.length - 1);
  const d = points
    .map(
      (p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - (p / max) * h).toFixed(1)}`
    )
    .join(' ');

  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="Travel history sparkline"
    >
      <path className={styles.sparkLine} d={d} />
    </svg>
  );
}
