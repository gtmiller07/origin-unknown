/**
 * /about — substantive scholarly self-positioning (Phase 7 spec): who the author is, the
 * institutional bridge the instrument occupies, the readers it is built for, the ethics and
 * data-handling stance, and a cite-this-instrument block. The personal-vantage paragraph is the
 * author's own voice to write; it is flagged with an editorial note rather than invented.
 */
import type { Metadata } from 'next';
import styles from '../transparency.module.css';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Origin Unknown is a doctoral research instrument measuring AI-mediated cultural diplomacy — its purpose, its institutional position, and how to cite it.',
};

const APA =
  'Miller, G. (2026). Origin Unknown: A methodological instrument for measuring AI-mediated cultural diplomacy [Research instrument]. https://originunknown.org';

const CHICAGO =
  'Miller, Grady. 2026. Origin Unknown: A Methodological Instrument for Measuring AI-Mediated Cultural Diplomacy. https://originunknown.org.';

const BIBTEX = `@misc{miller2026originunknown,
  author       = {Miller, Grady},
  title        = {Origin Unknown: A Methodological Instrument for
                  Measuring AI-Mediated Cultural Diplomacy},
  year         = {2026},
  howpublished = {\\url{https://originunknown.org}}
}`;

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <p className={styles.eyebrow}>About</p>
      <h1 className={styles.h1}>The work, and who it is for</h1>
      <p className={styles.lead}>
        Origin Unknown is a doctoral research instrument. It exists to make one argument testable:
        that when anyone with a phone and an API key can produce cinema, the question of which
        culture travels — and on whose terms — stops being rhetorical and becomes something we can
        measure as it happens.
      </p>

      <div className={styles.prose}>
        <h2>The author</h2>
        <p>
          Origin Unknown is designed, built, and maintained by <strong>Grady Miller</strong> as a
          full-stack research instrument and a doctoral application artifact. Every layer —
          ingestion, the scoring construct, the evidence panels — is built by hand, because the
          method <em>is</em> the argument: the claim that AI-mediated cultural diplomacy can be
          measured is only credible if the measuring is real, transparent, and contestable.
        </p>
        <div className={styles.editorNote}>
          <p>
            Editorial note — to be replaced before launch: this paragraph is reserved for the
            author&rsquo;s first-person account of what brought him to this question (his vantage on
            cultural research, the geopolitical interest, the Los Angeles institutional context). It
            is the one place on the site where the author should speak directly, and it should be
            written in his own voice rather than drafted for him.
          </p>
        </div>

        <h2>Why USC Media Arts + Practice</h2>
        <p>
          The instrument is built to sit on a specific bridge — the one MA+P uniquely spans between
          the School of Cinematic Arts, the Annenberg School for Communication, the Norman Lear
          Center, and the Center on Public Diplomacy. It is a piece of media practice (it is a
          working, designed thing), a communication-studies argument (it measures circulation and
          influence), and a public-diplomacy instrument (it asks what travels diplomatically) at
          once.
        </p>
        <p>
          It is written to be read by the people who hold those vantages: Henry Jenkins on
          participatory culture and circulation; Tara McPherson on building scholarly argument as
          software; the SCA practice tradition; the Annenberg and Lear traditions of measuring
          media&rsquo;s social reach; and the public-diplomacy lineage of Nicholas Cull and the CPD.
          The construct cites Cull, Nye, and Zaharna alongside Steyerl, Chun, Noble, Benjamin,
          Crawford, and Couldry &amp; Mejias precisely because the question lives where those
          literatures meet and none of them alone can answer it.
        </p>

        <h2>Ethics</h2>
        <p>
          The corpus studies cultural artifacts that were posted publicly. Machine-proposed scores
          are labeled as machine-proposed and unreviewed; they are evidence of how the instrument
          reads, not authoritative judgments about anyone&rsquo;s work. Ambiguity of origin is
          recorded as data, never resolved by guesswork. Every artifact carries an appeal affordance
          and a takedown route, and both are honored. The instrument measures an artifact&rsquo;s
          diplomatic travel and character, not a verdict on whether a creator or state is
          legitimate.
        </p>

        <h2>Data handling</h2>
        <ul>
          <li>
            No personally identifying information is stored. Viewer sessions hash the user agent and
            never persist IP addresses.
          </li>
          <li>
            Source content is linked to its origin rather than rehosted where rights require it; the
            published corpus carries derived and aggregate data, not wholesale redistribution of
            third-party content.
          </li>
          <li>
            Takedown requests route to a curator queue and are acted on; appeals are recorded for
            review.
          </li>
          <li>
            The full scoring construct and its version history are public, so any finding can be
            audited against the exact prompt that produced it.
          </li>
        </ul>

        <h2>Cite this instrument</h2>
        <p>If you reference Origin Unknown or its corpus, please cite it:</p>
      </div>

      <div className={styles.citeBlock}>
        <div className={styles.citeRow}>
          <p className={styles.citeKey}>APA</p>
          <p className={styles.citeVal}>{APA}</p>
        </div>
        <div className={styles.citeRow}>
          <p className={styles.citeKey}>Chicago</p>
          <p className={styles.citeVal}>{CHICAGO}</p>
        </div>
        <div className={styles.citeRow}>
          <p className={styles.citeKey}>BibTeX</p>
          <p className={styles.citeVal}>{BIBTEX}</p>
        </div>
      </div>

      <a className={styles.back} href="/">
        ← Origin Unknown
      </a>
    </div>
  );
}
