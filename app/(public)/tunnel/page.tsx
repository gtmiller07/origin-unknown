import { FlatTunnel } from '@/components/tunnel/FlatTunnel';
import { TunnelView } from '@/components/tunnel/TunnelView';
import { getStations, getTunnelArtifacts, getYearDensity } from '@/lib/queries/tunnel';
/**
 * /tunnel — the corridor of time (Phase 5). Server component: fetches the wall artifacts, the era
 * stations, and the year-density histogram, then renders the 3D corridor (TunnelView, which
 * client-side redirects WebGL-less / mobile viewers to the flat view) or the 2D `?mode=flat`
 * timeline.
 */
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'The tunnel',
  description: 'Twenty-five years of cultural production as a widening corridor of time.',
};

export default async function TunnelPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const [artifacts, stations] = await Promise.all([getTunnelArtifacts(600), getStations()]);

  if (mode === 'flat') {
    return <FlatTunnel artifacts={artifacts} stations={stations} />;
  }

  const density = await getYearDensity();
  return <TunnelView artifacts={artifacts} stations={stations} density={density} />;
}
