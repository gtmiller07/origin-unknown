import { AdjacencyRow } from '@/components/evidence/AdjacencyRow';
import { AppealForm } from '@/components/evidence/AppealForm';
import { ContentCredentials } from '@/components/evidence/ContentCredentials';
import { MediaRenderer } from '@/components/evidence/MediaRenderer';
import { PaglenQuestions } from '@/components/evidence/PaglenQuestions';
import { ProvenanceBlock } from '@/components/evidence/ProvenanceBlock';
import { ScoreDisplay } from '@/components/evidence/ScoreDisplay';
import { TravelSparkline } from '@/components/evidence/TravelSparkline';
import styles from '@/components/evidence/evidence.module.css';
import { displayTitle, getArtifactDetail } from '@/lib/queries/artifact';
/**
 * Artifact evidence panel (Phase 4). Server component: fetches the artifact, its six scores, the
 * evidence-panel record, and six adjacency neighbours, then lays them out Forensic-Architecture
 * style — artifact (left two-thirds) beside the interrogation panel (right third), collapsing to a
 * single stacked column on mobile. Scores shown are AI proposals until a curator confirms them.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await getArtifactDetail(id);
  if (!detail) return { title: 'Artifact not found' };
  return {
    title: displayTitle(detail.artifact.title, detail.artifact.description),
    description: detail.artifact.altText ?? undefined,
  };
}

export default async function ArtifactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getArtifactDetail(id);
  if (!detail) notFound();

  const { artifact, source, scores, evidencePanel, adjacency } = detail;
  const isAi =
    artifact.isAiGenerated === true ||
    artifact.aiMediation === 'ai_generated' ||
    artifact.aiMediation === 'ai_assisted';

  const dek = [
    source?.name,
    artifact.mediaType,
    artifact.publishedAt ? new Date(artifact.publishedAt).toISOString().slice(0, 10) : null,
  ].filter((x): x is string => Boolean(x));

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <a className={styles.crumb} href="/corpus">
          ← Corpus
        </a>
        <span className={styles.crumb}>{artifact.aiMediation ?? 'unclassified'}</span>
      </div>

      <h1 className={styles.headline}>{displayTitle(artifact.title, artifact.description)}</h1>
      <p className={styles.dek}>
        {dek.map((d, i) => (
          <span key={d}>
            {i > 0 ? <span className={styles.dekSep}>·</span> : null}
            {d}
          </span>
        ))}
      </p>

      <div className={styles.layout} style={{ marginTop: '1.5rem' }}>
        <div className={styles.mediaCol}>
          <MediaRenderer
            artifact={{
              mediaType: artifact.mediaType,
              contentUrl: artifact.contentUrl,
              thumbnailUrl: artifact.thumbnailUrl,
              title: artifact.title,
              description: artifact.description,
              altText: artifact.altText,
              isAiGenerated: artifact.isAiGenerated,
              sourceName: source?.name ?? null,
              publishedAt: artifact.publishedAt,
            }}
            priority="high"
          />
          {artifact.altText ? <p className={styles.caption}>{artifact.altText}</p> : null}
        </div>

        <div className={styles.panelCol}>
          {artifact.bearsOnDissertationQuestion && artifact.dissertationRelevance ? (
            <div className={styles.block}>
              <div className={styles.callout}>
                <p className={styles.calloutLabel}>Bears on the dissertation question</p>
                <p className={styles.calloutText}>{artifact.dissertationRelevance}</p>
              </div>
            </div>
          ) : null}

          <section className={styles.block}>
            <h2 className={styles.blockHead}>Provenance</h2>
            <ProvenanceBlock artifact={artifact} source={source} />
          </section>

          {isAi ? (
            <section className={styles.block}>
              <ContentCredentials
                artifact={artifact}
                trainingDataNotes={evidencePanel?.trainingDataNotes ?? null}
              />
            </section>
          ) : null}

          <section className={styles.block}>
            <h2 className={styles.blockHead}>Scoring</h2>
            <ScoreDisplay scores={scores} />
          </section>

          <section className={styles.block}>
            <h2 className={styles.blockHead}>Interrogative questions</h2>
            <PaglenQuestions questions={evidencePanel?.paglenQuestions ?? null} />
          </section>

          <section className={styles.block}>
            <h2 className={styles.blockHead}>Travel history</h2>
            <TravelSparkline travelHistory={evidencePanel?.travelHistory ?? null} />
          </section>

          <div className={styles.footer}>
            <AppealForm artifactId={artifact.id} />
            <a className={styles.takedown} href={`/takedown?artifact=${artifact.id}`}>
              Request takedown ↗
            </a>
          </div>
        </div>
      </div>

      <section style={{ marginTop: 'clamp(2.5rem, 6vh, 5rem)' }}>
        <h2 className={styles.blockHead}>Adjacent artifacts</h2>
        <AdjacencyRow items={adjacency} />
      </section>
    </div>
  );
}
