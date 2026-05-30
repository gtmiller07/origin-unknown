import { ComingSoon } from '@/app/_components/coming-soon';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'About' };

export default function Page() {
  return (
    <ComingSoon
      title="About"
      blurb="What Origin Unknown is, the question it was built to ask, and who is building it."
    />
  );
}
