import { ComingSoon } from '@/app/_components/coming-soon';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Scoring Log' };

export default function Page() {
  return (
    <ComingSoon
      title="Scoring Log"
      blurb="An auditable, public record of every scoring decision the instrument makes — artifact, axis, score, and the evidence behind it. It comes online with the scoring engine."
    />
  );
}
