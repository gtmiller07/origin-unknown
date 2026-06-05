'use client';

import type { ActionResult } from '@/app/actions/result';
import { submitAppeal } from '@/app/actions/submit-appeal';
/**
 * AppealForm — the public appeal affordance (Phase 4). Collapsed by default; on expand, a viewer
 * contests a specific axis with required reasoning. Submits via the submitAppeal Server Action
 * (React 19 useActionState), landing a row in public_appeals for curator review. The corpus invites
 * challenge by design.
 */
import { useActionState } from 'react';
import styles from './evidence.module.css';

const AXES: Array<[string, string]> = [
  ['origin', 'Origin'],
  ['reach', 'Reach'],
  ['aesthetic_signal', 'Aesthetic signal'],
  ['diplomatic_cross_boundary', 'Diplomatic — cross-boundary'],
  ['diplomatic_authenticity', 'Diplomatic — authenticity'],
  ['diplomatic_reciprocity', 'Diplomatic — reciprocity'],
];

export function AppealForm({ artifactId }: { artifactId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    submitAppeal,
    null
  );

  return (
    <details className={styles.appeal}>
      <summary>Contest a score</summary>
      {state?.ok ? (
        <p className={styles.msg}>Appeal received. A curator will review the contested axis.</p>
      ) : (
        <form action={action} className={styles.appealForm}>
          <input type="hidden" name="artifactId" value={artifactId} />
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Axis</span>
            <select className={styles.select} name="axis" defaultValue="origin">
              {AXES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Your reasoning</span>
            <textarea
              className={styles.textarea}
              name="challengerReasoning"
              required
              minLength={20}
              maxLength={2000}
              placeholder="What does the instrument get wrong about this axis, and why?"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Email (optional)</span>
            <input
              className={styles.input}
              type="email"
              name="challengerEmail"
              placeholder="you@example.org"
            />
          </label>
          {state && !state.ok && <p className={styles.err}>{state.error}</p>}
          <button className={styles.submit} type="submit" disabled={pending}>
            {pending ? 'Submitting…' : 'Submit appeal'}
          </button>
        </form>
      )}
    </details>
  );
}
