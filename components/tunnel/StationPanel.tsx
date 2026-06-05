'use client';

/**
 * StationPanel — the Ciechanowski-style interactive variables for the era station the camera is
 * nearest. Toggles and sliders that filter the visible wall artifacts via their filter predicates.
 * Rendered as an HTML overlay (not in the Canvas). Variables whose predicate references metadata the
 * corpus doesn't capture (e.g. mobile capture) are no-ops by design — noted in their description.
 */
import type { Station } from '@/lib/queries/tunnel';
import styles from './tunnel.module.css';

export function StationPanel({
  station,
  values,
  onChange,
}: {
  station: Station;
  values: Record<string, number | boolean>;
  onChange: (id: string, v: number | boolean) => void;
}) {
  if (!station.interactiveVariables.length) return null;
  return (
    <div className={styles.stationPanel}>
      <p className={styles.spStation}>{station.title}</p>
      {station.artifactDensity != null ? (
        <p className={styles.spDensity}>{station.artifactDensity} artifacts in this era</p>
      ) : null}
      <p className={styles.spHint}>Manipulate the era — toggle a counterfactual.</p>
      {station.interactiveVariables.map((v) => {
        const val = values[v.id] ?? v.default;
        return (
          <div key={v.id} className={styles.spVar}>
            {v.type === 'toggle' ? (
              <label className={styles.spToggleRow}>
                <input
                  type="checkbox"
                  checked={val === true}
                  onChange={(e) => onChange(v.id, e.target.checked)}
                />
                <span className={styles.spLabel}>{v.label}</span>
              </label>
            ) : (
              <div className={styles.spSliderRow}>
                <span className={styles.spLabel}>
                  {v.label}: {typeof val === 'number' ? val : 0}
                  {v.unit ?? ''}
                </span>
                <input
                  type="range"
                  min={v.min ?? 0}
                  max={v.max ?? 100}
                  value={typeof val === 'number' ? val : 0}
                  onChange={(e) => onChange(v.id, Number(e.target.value))}
                />
              </div>
            )}
            <p className={styles.spDesc}>{v.description}</p>
          </div>
        );
      })}
    </div>
  );
}
