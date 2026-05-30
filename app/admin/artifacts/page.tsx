import { ComingSoon } from '@/app/_components/coming-soon';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Artifacts' };

export default function Page() {
  return (
    <ComingSoon
      title="Artifacts"
      blurb="Browse, search, and manage the full ingested corpus."
      note="Ingestion and embeddings run on schedule; this curator surface is part of the Phase 3 build."
      backHref="/"
      backLabel="← Site"
    />
  );
}
