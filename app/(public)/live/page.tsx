import { ComingSoon } from '@/app/_components/coming-soon';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Live Feed' };

export default function Page() {
  return (
    <ComingSoon
      title="Live Feed"
      blurb="A real-time feed of artifacts as they enter the corpus — what was ingested, from where, and when. The ingestion pipeline is already live; this public window onto it is being built."
    />
  );
}
