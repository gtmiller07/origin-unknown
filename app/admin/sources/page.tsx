import { ComingSoon } from '@/app/_components/coming-soon';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sources' };

export default function Page() {
  return (
    <ComingSoon
      title="Sources"
      blurb="Manage ingestion sources — the feeds, accounts, and collections the instrument pulls from, and their per-source configuration."
      note="Ingestion and embeddings run on schedule; this curator surface is part of the Phase 3 build."
      backHref="/"
      backLabel="← Site"
    />
  );
}
