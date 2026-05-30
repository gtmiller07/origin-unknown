import { ComingSoon } from '@/app/_components/coming-soon';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Cost Controls' };

export default function Page() {
  return (
    <ComingSoon
      title="Cost Controls"
      blurb="Monitor and adjust the rolling cost caps that bound the instrument's API spend."
      note="The cost caps are already enforced in the pipeline; this curator surface is part of the Phase 3 build."
      backHref="/"
      backLabel="← Site"
    />
  );
}
