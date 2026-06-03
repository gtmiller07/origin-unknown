import type { Metadata } from 'next';
import styles from './home.module.css';

export const metadata: Metadata = {
  title: 'Origin Unknown',
  description:
    'A methodological instrument for measuring AI-mediated cultural diplomacy in real time.',
};

const EPIGRAPH_LINES = [
  'In 1955, Edward Steichen curated 503 photographs by 273 photographers from 68 countries.',
  'The exhibition traveled to 37 nations over eight years.',
  'Nine million people saw it.',
  'The United States Information Agency commissioned it.',
  'The photographs were chosen to demonstrate universal human experience.',
  'Roland Barthes called this a myth.',
  'He was right.',
  'The question the exhibition could not ask was whose universalism it was.',
  'That question is now operational.',
  'Anyone with a phone and an API key can produce cinema.',
  'Origin is no longer a given.',
  'Diplomatic effect is no longer a claim that requires a government.',
  'This instrument is designed to measure what happens next.',
];

const EMPIRICAL_ANCHOR = `In 2024, US favorability stood at 61% in Mexico and 54% in Canada. In Spring 2025, those numbers fell to 29% and 34%. In the same period, the technical floor of cultural production collapsed: anyone with a phone and an API key can now generate cinema. The Brand Finance Soft Power Index recorded China overtaking the United Kingdom for the first time. Pew's October 2025 Global AI Survey of 28,333 adults across 25 countries found 80% of Indonesians believe AI is more beneficial than harmful; only 39% of Americans agreed.`;

export default function HomePage() {
  return (
    <div className={styles.home}>
      {/* Hero — typographic treatment until rights-confirmed Family of Man image is sourced */}
      <header className={styles.hero} aria-label="Site title">
        <h1 className={styles.heroTitle}>Origin Unknown</h1>
        <p className={styles.heroSubtitle}>
          A Methodological Instrument for Measuring AI-Mediated Cultural Diplomacy
        </p>
      </header>

      {/* Epigraph */}
      <section className={styles.epigraph} aria-label="Epigraph">
        {EPIGRAPH_LINES.map((line, i) => (
          <p key={line} className={styles.epigraphLine} style={{ animationDelay: `${i * 0.18}s` }}>
            {line}
          </p>
        ))}
      </section>

      {/* Empirical anchor */}
      <section className={styles.anchor} aria-label="Empirical context">
        <p className={styles.anchorText}>{EMPIRICAL_ANCHOR}</p>
        <p className={styles.anchorCoda}>
          No instrument exists to measure how specific cultural content moves between these
          populations in real time. This is the instrument that does.
        </p>
      </section>

      {/* Finding line — placeholder until corpus is populated */}
      <p className={styles.findingLine} aria-live="polite">
        <em>
          The instrument is starting up. The first artifacts will appear after the corpus is seeded.
        </em>
      </p>

      {/* Entry affordance */}
      <div className={styles.entry}>
        <a href="/tunnel" className={styles.entryLink}>
          Enter the tunnel
        </a>
      </div>
    </div>
  );
}
