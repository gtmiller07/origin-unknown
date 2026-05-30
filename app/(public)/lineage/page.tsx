import { ComingSoon } from '@/app/_components/coming-soon';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Lineage' };

export default function Page() {
  return (
    <ComingSoon
      title="Lineage"
      blurb="How a single motif propagates across origins and platforms — the lineage view traces cultural content as it is reproduced, remixed, and re-attributed."
    />
  );
}
