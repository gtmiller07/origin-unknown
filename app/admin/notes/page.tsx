import { ComingSoon } from '@/app/_components/coming-soon';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Notes' };

export default function Page() {
  return (
    <ComingSoon
      title="Notes"
      blurb="Author and edit the research notes published to the public Notes feed."
      note="Ingestion and embeddings run on schedule; this curator surface is part of the Phase 3 build."
      backHref="/"
      backLabel="← Site"
    />
  );
}
