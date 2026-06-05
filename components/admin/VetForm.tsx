'use client';

import { type VetState, confirmVetting, removeArtifact } from '@/app/actions/vet';
import styles from '@/app/admin/admin.module.css';
import { AXIS_GUIDES } from '@/lib/vetting/axes';
/**
 * VetForm — the guided vetting interview (client). Walks a reviewer through the six axes one card at
 * a time: each shows a plain-language definition, the 0/1 anchors, the instrument's proposed value as
 * a bar, and its reasoning behind a disclosure. The reviewer confirms ("Looks right") or adjusts
 * (revealing a value + a note recorded in the scoring log). Two final judgments, then Confirm &
 * continue submits confirmVetting and advances to the next item. A separate, deliberately distinct
 * panel performs the soft delete via removeArtifact. No project knowledge is assumed.
 */
import { useActionState, useState } from 'react';

interface AxisScore {
  axis: string;
  aiProposedValue: number | null;
  aiReasoning: string | null;
  humanConfirmedValue: number | null;
}

export function VetForm({
  artifactId,
  scores,
  bearsOnDissertation,
  hasAltText,
  altTextConfirmed,
  nextId,
}: {
  artifactId: string;
  scores: AxisScore[];
  bearsOnDissertation: boolean;
  hasAltText: boolean;
  altTextConfirmed: boolean;
  nextId: string | null;
}) {
  const [confirmState, confirmAction, confirmPending] = useActionState<VetState, FormData>(
    confirmVetting,
    null
  );
  const [removeState, removeAction, removePending] = useActionState<VetState, FormData>(
    removeArtifact,
    null
  );
  const [adjust, setAdjust] = useState<Record<string, boolean>>({});
  const [showRemove, setShowRemove] = useState(false);

  const byAxis = new Map(scores.map((s) => [s.axis, s]));

  return (
    <div>
      <form action={confirmAction} className={styles.vetForm}>
        <input type="hidden" name="artifactId" value={artifactId} />
        {nextId ? <input type="hidden" name="nextId" value={nextId} /> : null}

        <ol className={styles.axisList}>
          {AXIS_GUIDES.map((g) => {
            const s = byAxis.get(g.key);
            if (!s || s.aiProposedValue == null) {
              return (
                <li key={g.key} className={styles.axisCard}>
                  <div className={styles.axisHead}>
                    <h3 className={styles.axisLabel}>{g.label}</h3>
                  </div>
                  <p className={styles.muted}>Not scored — left unchanged.</p>
                </li>
              );
            }
            const ai = s.aiProposedValue;
            const isAdjust = adjust[g.key] ?? false;
            return (
              <li key={g.key} className={styles.axisCard}>
                <div className={styles.axisHead}>
                  <h3 className={styles.axisLabel}>{g.label}</h3>
                  <span className={styles.axisQ}>{g.question}</span>
                </div>
                <p className={styles.axisPlain}>{g.plain}</p>
                <div className={styles.axisAnchors}>
                  <span>0 · {g.low}</span>
                  <span>{g.high} · 1</span>
                </div>
                <div className={styles.bar}>
                  <div className={styles.barFill} style={{ width: `${Math.round(ai * 100)}%` }} />
                  <span className={styles.barNum}>{ai.toFixed(2)}</span>
                </div>
                {s.aiReasoning ? (
                  <details className={styles.reasoning}>
                    <summary>Why the instrument scored it {ai.toFixed(2)}</summary>
                    <p>{s.aiReasoning}</p>
                  </details>
                ) : null}
                <fieldset className={styles.choice}>
                  <label>
                    <input
                      type="radio"
                      name={`axis_${g.key}_action`}
                      value="confirm"
                      defaultChecked
                      onChange={() => setAdjust((a) => ({ ...a, [g.key]: false }))}
                    />{' '}
                    Looks right
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`axis_${g.key}_action`}
                      value="revise"
                      onChange={() => setAdjust((a) => ({ ...a, [g.key]: true }))}
                    />{' '}
                    Adjust
                  </label>
                </fieldset>
                {isAdjust ? (
                  <div className={styles.revise}>
                    <label className={styles.reviseRow}>
                      New score (0–1)
                      <input
                        type="number"
                        name={`axis_${g.key}_value`}
                        min={0}
                        max={1}
                        step={0.05}
                        defaultValue={ai}
                        className={styles.numInput}
                      />
                    </label>
                    <label className={styles.reviseRow}>
                      Why — recorded in the scoring log
                      <textarea
                        name={`axis_${g.key}_note`}
                        rows={2}
                        className={styles.textarea}
                        placeholder="What did the instrument miss or overstate?"
                      />
                    </label>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className={styles.judgments}>
          <label className={styles.check}>
            <input type="checkbox" name="bearsOnDissertation" defaultChecked={bearsOnDissertation} />{' '}
            This artifact bears on the research question
          </label>
          {hasAltText ? (
            <label className={styles.check}>
              <input type="checkbox" name="altTextConfirmed" defaultChecked={altTextConfirmed} /> The
              alt text accurately describes the media
            </label>
          ) : null}
        </div>

        {confirmState?.error ? <p className={styles.error}>{confirmState.error}</p> : null}
        <button type="submit" className={styles.primary} disabled={confirmPending}>
          {confirmPending ? 'Saving…' : 'Confirm & continue →'}
        </button>
      </form>

      <div className={styles.altActions}>
        <a className={styles.skip} href={nextId ? `/admin/queue/${nextId}` : '/admin/queue'}>
          {nextId ? 'Skip for now →' : 'Back to queue'}
        </a>
        <button
          type="button"
          className={styles.removeToggle}
          onClick={() => setShowRemove((v) => !v)}
        >
          {showRemove ? 'Cancel removal' : 'Remove from corpus…'}
        </button>
      </div>

      {showRemove ? (
        <form action={removeAction} className={styles.removeForm}>
          <input type="hidden" name="artifactId" value={artifactId} />
          {nextId ? <input type="hidden" name="nextId" value={nextId} /> : null}
          <p className={styles.removeWarn}>
            Removing hides this artifact from the public corpus, field, tunnel, and search. Its
            scoring history is preserved and the action is reversible by an administrator.
          </p>
          <label className={styles.reviseRow}>
            Reason — required, recorded
            <textarea
              name="reason"
              rows={3}
              className={styles.textarea}
              placeholder="e.g. Duplicate record; broken media; not cultural content; takedown request honored."
              required
              minLength={10}
            />
          </label>
          {removeState?.error ? <p className={styles.error}>{removeState.error}</p> : null}
          <button type="submit" className={styles.danger} disabled={removePending}>
            {removePending ? 'Removing…' : 'Confirm removal'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
