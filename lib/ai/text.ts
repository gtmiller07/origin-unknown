/**
 * Pure text helpers for the embeddings pipeline (no SDK / network) so they can
 * be unit-tested in isolation, mirroring lib/ingestion/text.ts.
 */

/** Build the text to embed from an artifact's title + description; null if empty. */
export function embeddingInputText(artifact: {
  title: string | null;
  description: string | null;
}): string | null {
  const text = `${artifact.title ?? ''}\n${artifact.description ?? ''}`.trim();
  return text.length ? text : null;
}
