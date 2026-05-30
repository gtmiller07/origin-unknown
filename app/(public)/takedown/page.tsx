import { ComingSoon } from '@/app/_components/coming-soon';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Takedown' };

export default function Page() {
  return (
    <ComingSoon
      title="Takedown"
      blurb="A channel for rights holders to request that an artifact be removed from the corpus. Until the formal intake form is live, requests can be filed through the project's source repository."
    />
  );
}
