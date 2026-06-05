/**
 * PaglenQuestions — the three-to-five Paglen-style interrogative questions the scorer generated about
 * audience, exclusion, training data, and political/commercial beneficiaries. Open questions, not
 * answers: they are the artifact's invitation to be interrogated.
 */
import styles from './evidence.module.css';

export function PaglenQuestions({ questions }: { questions: string[] | null }) {
  if (!questions || questions.length === 0) {
    return (
      <p className={styles.empty}>No interrogative questions were generated for this artifact.</p>
    );
  }
  return (
    <ol className={styles.paglen}>
      {questions.map((q) => (
        <li key={q} className={styles.paglenItem}>
          {q}
        </li>
      ))}
    </ol>
  );
}
