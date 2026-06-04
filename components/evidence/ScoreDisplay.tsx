/**
 * ScoreDisplay — the six axes with the three diplomatic sub-measures grouped as a visually-distinct
 * triad under a "Diplomatic effect" heading, the composite mean shown read-only (Section 8 / Phase 4
 * spec). Each axis carries its AI reasoning in a collapsed <details> (expand on click); human-confirmed
 * values and reasoning take precedence and are shown where present. Scores are proposals until a
 * curator confirms them — the tag states which.
 */
import type { Score } from '@/lib/db/schema';
import styles from './evidence.module.css';

const NON_DIPLOMATIC: Array<[string, string]> = [
  ['origin', 'Origin'],
  ['reach', 'Reach'],
  ['aesthetic_signal', 'Aesthetic signal'],
];
const DIPLOMATIC: Array<[string, string]> = [
  ['diplomatic_cross_boundary', 'Cross-boundary'],
  ['diplomatic_authenticity', 'Authenticity'],
  ['diplomatic_reciprocity', 'Reciprocity'],
];

function pickValue(s?: Score): { value: number | null; display: string } {
  if (!s) return { value: null, display: '—' };
  const raw = s.humanConfirmedValue ?? s.value ?? s.aiProposedValue;
  if (raw == null) return { value: null, display: 'unscored' };
  const n = Number(raw);
  return { value: n, display: n.toFixed(2) };
}

function AxisRow({ label, score }: { label: string; score?: Score }) {
  const { value, display } = pickValue(score);
  const reasoning = score?.humanReasoning ?? score?.aiReasoning ?? null;
  return (
    <div className={styles.axis}>
      <div className={styles.axisTop}>
        <span className={styles.axisLabel}>{label}</span>
        <span className={`${styles.axisVal} ${value == null ? styles.axisValNull : ''}`}>
          {display}
        </span>
      </div>
      <div className={styles.bar} aria-hidden="true">
        {value != null && (
          <div className={styles.barFill} style={{ width: `${Math.round(value * 100)}%` }} />
        )}
      </div>
      {reasoning && (
        <details className={styles.reason}>
          <summary>Reasoning</summary>
          <p className={styles.reasonText}>{reasoning}</p>
        </details>
      )}
    </div>
  );
}

export function ScoreDisplay({ scores }: { scores: Score[] }) {
  if (scores.length === 0) {
    return <p className={styles.empty}>This artifact has not been scored yet.</p>;
  }

  const byAxis = new Map(scores.map((s) => [s.axis, s]));
  const version = scores.find((s) => s.scoringPromptVersion)?.scoringPromptVersion ?? null;
  const anyHuman = scores.some((s) => (s.humanConfirmedValue ?? s.value) != null);

  const subValues = DIPLOMATIC.map(([axis]) => pickValue(byAxis.get(axis)).value).filter(
    (v): v is number => v != null
  );
  const composite = subValues.length
    ? (subValues.reduce((a, b) => a + b, 0) / subValues.length).toFixed(2)
    : '—';

  return (
    <div>
      <p className={styles.scoreTag}>
        {anyHuman ? 'human-confirmed where shown' : 'AI-proposed · machine, unreviewed'}
        {version ? ` · prompt v${version}` : ''}
      </p>

      {NON_DIPLOMATIC.map(([axis, label]) => (
        <AxisRow key={axis} label={label} score={byAxis.get(axis)} />
      ))}

      <div className={styles.triad}>
        <div className={styles.triadHead}>
          <span className={styles.triadTitle}>Diplomatic effect</span>
          <span className={styles.triadComposite}>
            composite <strong>{composite}</strong>
          </span>
        </div>
        {DIPLOMATIC.map(([axis, label]) => (
          <AxisRow key={axis} label={label} score={byAxis.get(axis)} />
        ))}
      </div>
    </div>
  );
}
