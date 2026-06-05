import { LiveField } from '@/components/ambient/LiveField';
import { LiveList } from '@/components/ambient/LiveList';
import { getAmbientParticles, getLiveStatus, listLivePublished } from '@/lib/queries/ambient';
/**
 * /live — the ambient field (Phase 6). Server component: fetches the particle set + live status and
 * renders the R3F field, or the list fallback at ?view=list.
 */
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Live feed',
  description:
    'The live ambient field — every scored artifact as a particle, mapped by origin, aesthetic, reach, and diplomatic effect.',
};

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const status = await getLiveStatus();

  if (view === 'list') {
    const items = await listLivePublished(60);
    return <LiveList items={items} status={status} />;
  }

  const particles = await getAmbientParticles(400);
  return <LiveField particles={particles} status={status} />;
}
