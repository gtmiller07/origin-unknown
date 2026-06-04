import { db } from '@/lib/db/client';
import { eraStations } from '@/lib/db/schema';
/**
 * Compute each era station's artifact density — the count of scored, dated, non-removed artifacts in
 * the era it opens, defined as [this station's year, the next station's year). The last station runs
 * to the present. Stations keep their fixed inflection-point positions (the named events); only the
 * density figure is data-driven, so the corridor can honestly say how full each era is. Writes
 * era_stations.artifact_density. Idempotent.
 */
import { asc, eq, sql } from 'drizzle-orm';

export interface StationDensity {
  id: string;
  title: string;
  startYear: number | null;
  density: number;
}

export async function computeStationDensities(): Promise<StationDensity[]> {
  const stations = await db
    .select({ id: eraStations.id, title: eraStations.title, startDate: eraStations.startDate })
    .from(eraStations)
    .where(eq(eraStations.isVisible, true))
    .orderBy(asc(eraStations.startDate));

  const years = stations.map((s) => (s.startDate ? new Date(s.startDate).getUTCFullYear() : null));
  const now = new Date().toISOString();
  const out: StationDensity[] = [];

  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    if (!s) continue;
    const lo = years[i] ?? null;
    const hi = years[i + 1] ?? 9999;
    let density = 0;
    if (lo != null) {
      const [r] = (await db.execute(sql`
        SELECT count(*)::int AS n FROM artifacts
        WHERE status = 'scored' AND removed_at IS NULL AND published_at IS NOT NULL
          AND extract(year FROM published_at) >= ${lo}
          AND extract(year FROM published_at) < ${hi}
      `)) as unknown as Array<{ n: number }>;
      density = r?.n ?? 0;
    }
    await db
      .update(eraStations)
      .set({ artifactDensity: density, updatedAt: now })
      .where(eq(eraStations.id, s.id));
    out.push({ id: s.id, title: s.title, startYear: lo, density });
  }

  return out;
}
