import type { Artifact } from '@/lib/db/schema';
import type { SourceMeta } from '@/lib/queries/artifact';
/**
 * ProvenanceBlock — the forensic data dump, in JetBrains Mono (Phase 4 spec): source, original URL,
 * first-seen, declared origin, languages, and the full authorship taxonomy with its provenance
 * marker (source_prior / ai_proposed / human_confirmed). Ambiguity is shown as data, never hidden.
 */
import type { ReactNode } from 'react';
import styles from './evidence.module.css';

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toISOString().slice(0, 10);
}
function shorten(url: string, max = 44): string {
  return url.length > max ? `${url.slice(0, max - 1)}…` : url;
}
function muted(v: string | null | undefined, fallback = 'unknown'): ReactNode {
  return v ? v : <span className={styles.provMuted}>{fallback}</span>;
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className={styles.provRow}>
      <span className={styles.provKey}>{k}</span>
      <span className={styles.provVal}>{children}</span>
    </div>
  );
}

export function ProvenanceBlock({
  artifact,
  source,
}: {
  artifact: Artifact;
  source: SourceMeta | null;
}) {
  const origin = artifact.originCountryCodes?.length
    ? artifact.originCountryCodes.join(', ')
    : null;
  const langs = artifact.languageCodes?.length ? artifact.languageCodes.join(', ') : null;

  return (
    <dl className={styles.prov}>
      <Row k="Source">
        {source?.name ? source.name : muted(null)}
        {source?.category ? ` · ${source.category}` : ''}
      </Row>
      <Row k="Original URL">
        {artifact.contentUrl ? (
          <a href={artifact.contentUrl} target="_blank" rel="noopener noreferrer">
            {shorten(artifact.contentUrl)}
          </a>
        ) : (
          muted(null)
        )}
      </Row>
      <Row k="First seen">{fmtDate(artifact.firstSeenAt)}</Row>
      <Row k="Published">{fmtDate(artifact.publishedAt)}</Row>
      <Row k="Declared origin">{muted(origin)}</Row>
      <Row k="Languages">{muted(langs)}</Row>
      <Row k="AI mediation">
        {muted(artifact.aiMediation)}
        {artifact.aiMediationProvenance ? ` (${artifact.aiMediationProvenance})` : ''}
      </Row>
      <Row k="Authorship">
        {muted(artifact.authorshipClass)}
        {artifact.authorshipClassProvenance ? ` (${artifact.authorshipClassProvenance})` : ''}
      </Row>
      <Row k="Origin ambiguity">{muted(artifact.originAmbiguity)}</Row>
      <Row k="Relevance gate">
        {artifact.gateDecision
          ? `${artifact.gateDecision}${artifact.gateMethod ? ` · ${artifact.gateMethod}` : ''}`
          : muted(null, 'not gated')}
      </Row>
    </dl>
  );
}
