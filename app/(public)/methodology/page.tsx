import { ComingSoon } from '@/app/_components/coming-soon';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Methodology' };

export default function Page() {
  return (
    <ComingSoon
      title="Methodology"
      blurb="The full methodological account — the six measurement axes, the scoring protocol, the sampling frame, and the stated limitations — is being written up here."
    />
  );
}
