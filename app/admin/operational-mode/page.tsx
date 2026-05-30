import { ComingSoon } from '@/app/_components/coming-soon';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Operational Mode' };

export default function Page() {
  return (
    <ComingSoon
      title="Operational Mode"
      blurb="Set the instrument's global operational mode — how aggressively it ingests, embeds, and scores."
      note="Ingestion and embeddings run on schedule; this curator surface is part of the Phase 3 build."
      backHref="/"
      backLabel="← Site"
    />
  );
}
