import { ComingSoon } from '@/app/_components/coming-soon';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Notes' };

export default function Page() {
  return (
    <ComingSoon
      title="Notes"
      blurb="Dispatches from the build — research notes on what the corpus is beginning to show and how the instrument is evolving."
    />
  );
}
