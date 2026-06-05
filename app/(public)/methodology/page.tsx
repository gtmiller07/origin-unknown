import { getActivePrompt } from '@/lib/queries/transparency';
/**
 * /methodology — the scholarly account of how the instrument measures, plus the verbatim active
 * scoring prompt loaded from the database (so the page can never drift from what is actually run).
 */
import type { Metadata } from 'next';
import styles from '../transparency.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Methodology',
  description:
    'How Origin Unknown measures the diplomatic travel of AI-mediated culture: the six axes, the scoring protocol, and the verbatim active prompt.',
};

export default async function MethodologyPage() {
  const prompt = await getActivePrompt();

  return (
    <div className={styles.page}>
      <p className={styles.eyebrow}>Methodology</p>
      <h1 className={styles.h1}>How the instrument measures</h1>
      <p className={styles.lead}>
        Origin Unknown is a measurement instrument, not an archive. It asks a single question of
        every artifact it ingests: when the technical floor of cultural production drops to zero and
        origin becomes ambiguous, what determines which content travels diplomatically — and by what
        method could we know it as it happens?
      </p>

      <div className={styles.prose}>
        <h2>The comparison the corpus is built to make</h2>
        <p>
          The corpus is a controlled contrast between two classes of cultural production. The{' '}
          <strong>incumbent</strong> baseline is human-made, institutionally-attributed culture —
          state newsrooms, public broadcasters, museums, commercial media. The{' '}
          <strong>challenger</strong> class is AI-generated and AI-assisted user content whose
          origin is frequently ambiguous. The six axes below are scored identically for both
          classes; the incumbent-versus-challenger contrast is the finding, never a reason to grade
          on a curve. Ambiguity is treated as data — recorded as <em>unknown</em>,{' '}
          <em>ambiguous</em>, or <em>high</em> — never as a missing value, because under the
          dissertation question ambiguous origin is precisely the condition of interest.
        </p>

        <h2>The relevance gate</h2>
        <p>
          Opus scoring is expensive, so a lightweight Haiku classifier triages every embedded
          artifact first on two independent axes — whether it is cultural storytelling, and whether
          it is AI-mediated or origin-ambiguous — and keeps an artifact if it clears <em>either</em>
          . A known generative-AI community enters by taxonomy prior; a state newsroom enters as
          part of a stratified incumbent baseline; everything else is decided by the classifier. The
          gate method is recorded per artifact (
          <span className={styles.axisName}>taxonomy_prior</span>,{' '}
          <span className={styles.axisName}>baseline_sample</span>,{' '}
          <span className={styles.axisName}>haiku_triage</span>) so the sampling frame is
          reconstructable from the database.
        </p>

        <h2>The six axes</h2>
        <p>
          Each axis is scored in <span className={styles.axisName}>[0.00, 1.00]</span> with a
          50-to-150-word reasoning that must name specific evidence. Most artifacts score low or
          moderate on most axes; high scores require explicit evidence and are the most scrutinized
          in review.
        </p>
        <h3>Origin</h3>
        <p>
          Cultural, computational, and geographic provenance — where this is from, and how legibly.
        </p>
        <h3>Reach</h3>
        <p>
          Cross-boundary travel and audience geography, weighting dubbing and translation as primary
          reach signals.
        </p>
        <h3>Aesthetic signal</h3>
        <p>
          Stylistic distinctiveness — a recognizable, non-generic fingerprint versus a smoothed,
          interchangeable one. Empirically this is the axis on which AI-mediated and incumbent media
          most diverge.
        </p>

        <h2>The diplomatic-effect surface</h2>
        <p>
          Diplomatic effect is not one thing, so it is not scored as one number. It is decomposed
          into three independently-scored sub-measures, each grounded in a distinct tradition, and a
          read-only composite mean is shown for reference only:
        </p>
        <h3>Cross-boundary</h3>
        <p>
          Drawing on Cull&rsquo;s and Zaharna&rsquo;s relational frame: did the piece cross
          national, linguistic, or cultural lines in ways that produced engagement on the receiving
          side? American content viral in America has not crossed boundaries diplomatically;
          American content consumed in Tehran with Persian subtitles, generating discussion among
          Iranian audiences, has.
        </p>
        <h3>Authenticity</h3>
        <p>
          Drawing on Steyerl&rsquo;s poor-image theory: did the artifact carry its origin&rsquo;s
          specificity across the boundary, or get stripped for frictionless global circulation?
        </p>
        <h3>Reciprocity</h3>
        <p>
          Drawing on the <em>Family of Man</em>&rsquo;s bilateral assumption and Chun&rsquo;s
          critique of algorithmic homophily: is the cultural travel one-way or two-way? Most
          artifacts score low here; the asymmetry is itself the diplomatic finding.
        </p>

        <h2>The scoring protocol</h2>
        <p>
          Scores are <strong>proposals</strong>, never verdicts. Claude Opus proposes each axis
          value and its reasoning; the proposal is stored in its own columns and a curator may later
          confirm or revise it, with every field carrying a provenance marker —{' '}
          <span className={styles.axisName}>source_prior</span>,{' '}
          <span className={styles.axisName}>ai_proposed</span>, or{' '}
          <span className={styles.axisName}>human_confirmed</span>. Until a human confirms a value,
          the evidence panel labels it as machine-proposed and unreviewed. Anyone may contest a
          score through the appeal affordance on each artifact. The relevance gate uses Claude
          Haiku; adjacency uses OpenAI{' '}
          <span className={styles.axisName}>text-embedding-3-small</span>
          (1,536 dimensions) over a pgvector HNSW index.
        </p>

        <h2>Authorship taxonomy</h2>
        <p>
          Every artifact is classified on three dimensions, each with its provenance:{' '}
          <span className={styles.axisName}>authorship_class</span> (individual, community,
          commercial-institutional, state-affiliated, or ambiguous-unattributable),{' '}
          <span className={styles.axisName}>ai_mediation</span> (human-made, ai-assisted,
          ai-generated, or unknown), and <span className={styles.axisName}>origin_ambiguity</span>{' '}
          (none, low, high). Where the platform establishes ground truth it is honored; where the
          artifact gives no reliable signal, that uncertainty is recorded rather than guessed.
        </p>

        <h2>Stated limitations</h2>
        <ul>
          <li>
            Machine proposals shown on the site are unreviewed unless explicitly marked
            human-confirmed; they are evidence of how the instrument reads, not settled judgments.
          </li>
          <li>
            Language detection under-tags short, English-titled non-English content, so
            cross-cultural cuts are made by declared channel origin rather than detected language.
          </li>
          <li>
            The scorer reasons over metadata and a thumbnail description, not full-resolution video.
          </li>
          <li>
            The corpus is a sampling frame, not a census; reach and travel history are
            under-observed because most artifacts have no measured cross-border circulation yet.
          </li>
        </ul>

        {prompt ? (
          <>
            <h2>The active scoring prompt</h2>
            <p>
              The instrument is currently running prompt version <strong>{prompt.version}</strong>.
              The exact text below is loaded live from the database, so this page can never drift
              from what is actually executed. Every prior version, with the dates each was active,
              is on the <a href="/scoring-prompts">prompt version history</a>.
            </p>
            <p className={styles.codeLabel}>System prompt — v{prompt.version}</p>
            <pre className={styles.code}>{prompt.systemPrompt}</pre>
            <p className={styles.codeLabel}>Instruction template</p>
            <pre className={styles.code}>{prompt.instructionTemplate}</pre>
          </>
        ) : (
          <p>
            <a href="/scoring-prompts">Prompt version history →</a>
          </p>
        )}
      </div>

      <a className={styles.back} href="/">
        ← Origin Unknown
      </a>
    </div>
  );
}
