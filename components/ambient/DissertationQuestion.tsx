'use client';

/**
 * The dissertation question lands in the field on first visit. Per Section 8: it fades in after a 5s
 * delay, persists ~30s, then dissolves slowly — "not asked, but given." Gated once per ~24h via
 * localStorage as a v1 (the spec's viewer_sessions.ambient_field_question_shown, keyed off the
 * existing session_token cookie, is the exact-fidelity follow-on).
 */
import { useEffect, useState } from 'react';
import styles from './ambient.module.css';

const QUESTION =
  'When the technical floor of cultural production drops to zero and origin becomes ambiguous, what determines which content travels diplomatically, and by what method could we know it as it happens?';
const KEY = 'ou_dq_shown_at';
const DAY_MS = 86_400_000;

export function DissertationQuestion() {
  const [phase, setPhase] = useState<'hidden' | 'in' | 'out'>('hidden');

  useEffect(() => {
    let last = 0;
    try {
      last = Number(localStorage.getItem(KEY) ?? 0);
    } catch {
      last = 0;
    }
    if (Date.now() - last < DAY_MS) return;

    const tIn = setTimeout(() => setPhase('in'), 5000);
    const tOut = setTimeout(() => setPhase('out'), 35000);
    const tEnd = setTimeout(() => {
      setPhase('hidden');
      try {
        localStorage.setItem(KEY, String(Date.now()));
      } catch {
        // ignore storage failures — the question simply shows again next visit
      }
    }, 40000);

    return () => {
      clearTimeout(tIn);
      clearTimeout(tOut);
      clearTimeout(tEnd);
    };
  }, []);

  if (phase === 'hidden') return null;

  return (
    <div
      className={`${styles.question} ${phase === 'in' ? styles.questionIn : styles.questionOut}`}
      aria-live="polite"
    >
      <p className={styles.questionText}>{QUESTION}</p>
    </div>
  );
}
