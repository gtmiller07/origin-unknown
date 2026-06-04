'use client';

import { type GovState, resolveTakedown } from '@/app/actions/governance';
import styles from '@/app/admin/admin.module.css';
/**
 * TakedownActions — honor (soft-deletes the artifact) or decline a takedown request, with an optional
 * note recorded on the request. The decision rides on the submit button's name/value, so no extra
 * client state is needed. On success the action revalidates and the row moves to resolved.
 */
import { useActionState } from 'react';

export function TakedownActions({
  takedownId,
  hasArtifact,
  alreadyRemoved,
}: {
  takedownId: string;
  hasArtifact: boolean;
  alreadyRemoved: boolean;
}) {
  const [state, action, pending] = useActionState<GovState, FormData>(resolveTakedown, null);
  return (
    <form action={action} className={styles.govActions}>
      <input type="hidden" name="takedownId" value={takedownId} />
      <textarea
        name="note"
        rows={2}
        className={styles.textarea}
        placeholder="Decision note (optional, recorded on the request)"
      />
      <div className={styles.govBtns}>
        <button
          type="submit"
          name="decision"
          value="honor"
          className={styles.danger}
          disabled={pending}
        >
          {hasArtifact
            ? alreadyRemoved
              ? 'Honor (already hidden)'
              : 'Honor → remove artifact'
            : 'Honor'}
        </button>
        <button
          type="submit"
          name="decision"
          value="decline"
          className={styles.ghostBtn}
          disabled={pending}
        >
          Decline
        </button>
      </div>
      {state?.error ? <p className={styles.error}>{state.error}</p> : null}
    </form>
  );
}
