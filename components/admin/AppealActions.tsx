'use client';

import { type GovState, resolveAppeal } from '@/app/actions/governance';
import styles from '@/app/admin/admin.module.css';
/**
 * AppealActions — uphold an appeal (revise the challenged axis to a new score, writing a
 * human_revised scoring_events row) or reject it (keep the score, recorded as human_confirmed). The
 * decision rides on the submit button's name/value.
 */
import { useActionState } from 'react';

export function AppealActions({ appealId, aiValue }: { appealId: string; aiValue: number | null }) {
  const [state, action, pending] = useActionState<GovState, FormData>(resolveAppeal, null);
  return (
    <form action={action} className={styles.govActions}>
      <input type="hidden" name="appealId" value={appealId} />
      <label className={styles.reviseRow}>
        Revised score (0–1) — used if upholding
        <input
          type="number"
          name="newValue"
          min={0}
          max={1}
          step={0.05}
          defaultValue={aiValue ?? 0.5}
          className={styles.numInput}
        />
      </label>
      <textarea
        name="note"
        rows={2}
        className={styles.textarea}
        placeholder="Decision note (optional, recorded in the scoring log)"
      />
      <div className={styles.govBtns}>
        <button
          type="submit"
          name="decision"
          value="accept"
          className={styles.primary}
          disabled={pending}
        >
          Uphold → revise score
        </button>
        <button
          type="submit"
          name="decision"
          value="reject"
          className={styles.ghostBtn}
          disabled={pending}
        >
          Reject (keep score)
        </button>
      </div>
      {state?.error ? <p className={styles.error}>{state.error}</p> : null}
    </form>
  );
}
