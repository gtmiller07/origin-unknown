import { listScoringPrompts } from '@/lib/queries/transparency';
/**
 * /scoring-prompts — the public version history of every scoring construct the instrument has run,
 * each with its full system prompt and instruction template, so any finding can be audited against
 * the exact prompt that produced it.
 */
import type { Metadata } from 'next';
import styles from '../transparency.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Scoring prompts',
  description: 'The full version history of every scoring prompt Origin Unknown has used.',
};

function fmt(d: string | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : '—';
}

export default async function ScoringPromptsPage() {
  const prompts = await listScoringPrompts();

  return (
    <div className={`${styles.page} ${styles.wide}`}>
      <p className={styles.eyebrow}>Transparency</p>
      <h1 className={styles.h1}>Prompt version history</h1>
      <p className={styles.lead}>
        Every version of the scoring construct the instrument has run, newest first. Each score in
        the corpus records the version that produced it, so a finding can always be read against its
        exact prompt.
      </p>

      {prompts.length === 0 ? (
        <p className={styles.versionNotes}>No prompts recorded.</p>
      ) : (
        <ul className={styles.versionList}>
          {prompts.map((p) => (
            <li key={p.version} className={styles.versionItem}>
              <div className={styles.versionHead}>
                <span className={styles.versionNum}>v{p.version}</span>
                <span className={`${styles.badge} ${p.active ? '' : styles.badgeMuted}`}>
                  {p.active ? 'active' : 'retired'}
                </span>
                <span className={styles.versionMeta}>added {fmt(p.createdAt)}</span>
              </div>
              {p.notes ? <p className={styles.versionNotes}>{p.notes}</p> : null}
              <details className={styles.disclosure}>
                <summary>System prompt</summary>
                <pre className={styles.code}>{p.systemPrompt}</pre>
              </details>
              <details className={styles.disclosure}>
                <summary>Instruction template</summary>
                <pre className={styles.code}>{p.instructionTemplate}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}

      <a className={styles.back} href="/methodology">
        ← Methodology
      </a>
    </div>
  );
}
