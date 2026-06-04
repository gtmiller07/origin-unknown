'use client';

import type { ActionResult } from '@/app/actions/result';
import { submitTakedown } from '@/app/actions/submit-takedown';
/**
 * TakedownForm — client form for the public takedown route. Submits via the submitTakedown Server
 * Action (React 19 useActionState). The artifact id is passed through hidden when the request
 * arrives from an evidence panel's "Request takedown" link.
 */
import { useActionState } from 'react';
import styles from '../transparency.module.css';

export function TakedownForm({ artifactId }: { artifactId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    submitTakedown,
    null
  );

  if (state?.ok) {
    return (
      <p className={styles.msg}>
        Your request has been received. A curator will review it and respond to the email you
        provided.
      </p>
    );
  }

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="artifactId" value={artifactId} />
      <label className={styles.field}>
        <span className={styles.label}>Your email</span>
        <input
          className={styles.input}
          type="email"
          name="requesterEmail"
          required
          placeholder="you@example.org"
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Your relationship to the content</span>
        <input
          className={styles.input}
          type="text"
          name="requesterRelationship"
          required
          placeholder="e.g. depicted person, rights holder, creator"
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Reasoning</span>
        <textarea
          className={styles.textarea}
          name="reasoning"
          required
          minLength={20}
          maxLength={2000}
          placeholder="Identify the content and explain the basis for removal."
        />
      </label>
      {state && !state.ok ? <p className={styles.err}>{state.error}</p> : null}
      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  );
}
