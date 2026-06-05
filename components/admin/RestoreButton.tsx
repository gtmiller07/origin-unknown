'use client';

import { type VetState, restoreArtifact } from '@/app/actions/vet';
import styles from '@/app/admin/admin.module.css';
/**
 * RestoreButton — un-removes a soft-deleted artifact. On success the action revalidates /admin/removed
 * and the row drops out of the list (no navigation). Errors render inline.
 */
import { useActionState } from 'react';

export function RestoreButton({ artifactId }: { artifactId: string }) {
  const [state, action, pending] = useActionState<VetState, FormData>(restoreArtifact, null);
  return (
    <form action={action}>
      <input type="hidden" name="artifactId" value={artifactId} />
      <button type="submit" className={styles.restoreBtn} disabled={pending}>
        {pending ? 'Restoring…' : 'Restore'}
      </button>
      {state?.error ? <span className={styles.error}>{state.error}</span> : null}
    </form>
  );
}
