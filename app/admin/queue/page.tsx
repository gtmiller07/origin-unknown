import { ComingSoon } from '@/app/_components/coming-soon';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Review Queue' };

export default function Page() {
  return (
    <ComingSoon
      title="Review Queue"
      blurb="The triage queue — newly ingested artifacts awaiting curator review, scoring, and publication."
      note="Ingestion and embeddings run on schedule; this curator surface is part of the Phase 3 build."
      backHref="/"
      backLabel="← Site"
    />
  );
}
