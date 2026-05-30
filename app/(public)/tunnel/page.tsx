import { ComingSoon } from '@/app/_components/coming-soon';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'The Tunnel' };

export default function Page() {
  return (
    <ComingSoon
      title="The Tunnel"
      blurb="The tunnel is the immersive traversal of the corpus — a spatial walk through artifacts arranged by origin and diplomatic effect. It is the centerpiece of the public instrument."
    />
  );
}
