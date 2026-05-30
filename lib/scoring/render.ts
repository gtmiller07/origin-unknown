/**
 * Pure helpers that turn an artifact (plus its source row) into the three text
 * blocks the active instruction template expects. No DB or network access here
 * so prompt assembly stays unit-testable; the job layer supplies the data and
 * the template, this module only formats.
 */

/** Artifact fields relevant to scoring. Mirrors the columns the job selects. */
export interface ArtifactForScoring {
  title: string | null;
  description: string | null;
  contentUrl: string | null;
  thumbnailUrl: string | null;
  mediaType: string | null;
  languageCodes: string[] | null;
  originCountryCodes: string[] | null;
  publishedAt: string | null;
  isAiGenerated: boolean | null;
  aiGenerationMetadata: unknown;
  externalId: string;
}

/** The artifact's source provenance, used for the source-context block. */
export interface ArtifactSourceContext {
  sourceName: string | null;
  sourceCategory: string | null;
  sourceNotes: string | null;
}

function line(label: string, value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed ? `${label}: ${trimmed}` : null;
}

function listLine(label: string, values: string[] | null | undefined): string | null {
  if (!values || values.length === 0) return null;
  const cleaned = values.map((v) => v.trim()).filter(Boolean);
  return cleaned.length ? `${label}: ${cleaned.join(', ')}` : null;
}

/** Labelled metadata block. Empty fields are omitted so the model isn't fed noise. */
export function artifactMetadata(a: ArtifactForScoring): string {
  const lines = [
    line('Title', a.title),
    line('Description', a.description),
    line('Media type', a.mediaType),
    listLine('Language codes', a.languageCodes),
    listLine('Origin country codes', a.originCountryCodes),
    line('Published at', a.publishedAt),
    line('Content URL', a.contentUrl),
    a.isAiGenerated === null ? null : `AI-generated: ${a.isAiGenerated ? 'yes' : 'no'}`,
    a.aiGenerationMetadata
      ? `AI generation metadata: ${JSON.stringify(a.aiGenerationMetadata)}`
      : null,
    line('External ID', a.externalId),
  ].filter((l): l is string => l !== null);

  return ['ARTIFACT METADATA', ...lines].join('\n');
}

/**
 * Thumbnail block. The pipeline has no automated vision description yet, so we
 * hand the model the URL and explicitly flag that aesthetic-signal evidence is
 * provisional rather than letting it hallucinate a visual it never saw.
 */
export function thumbnailDescription(input: {
  thumbnailUrl: string | null;
  mediaType: string | null;
}): string {
  if (!input.thumbnailUrl) {
    return 'ARTIFACT THUMBNAIL\nNo thumbnail is available for this artifact.';
  }
  const kind = input.mediaType?.trim() || 'media';
  return [
    'ARTIFACT THUMBNAIL',
    `Thumbnail URL (${kind}): ${input.thumbnailUrl.trim()}`,
    'No automated visual description is available; treat aesthetic-signal evidence drawn from the thumbnail as provisional.',
  ].join('\n');
}

/** Source-provenance block so the model can weigh where the artifact came from. */
export function sourceContext(input: ArtifactSourceContext): string {
  const lines = [
    line('Source name', input.sourceName),
    line('Source category', input.sourceCategory),
    line('Source notes', input.sourceNotes),
  ].filter((l): l is string => l !== null);

  if (lines.length === 0) {
    return 'ARTIFACT SOURCE CONTEXT\nNo source metadata is recorded for this artifact.';
  }
  return ['ARTIFACT SOURCE CONTEXT', ...lines].join('\n');
}

/** Fill the active instruction template's three placeholders. */
export function renderInstruction(
  template: string,
  parts: { metadata: string; thumbnail: string; source: string }
): string {
  return template
    .replaceAll('{artifact_metadata}', parts.metadata)
    .replaceAll('{artifact_thumbnail_description}', parts.thumbnail)
    .replaceAll('{artifact_source_context}', parts.source);
}
