/**
 * FlatTunnel — the 2D `/tunnel?mode=flat` fallback (WebGL-free, mobile, reduced-motion path). The
 * same content as the 3D corridor, read as a vertical timeline 1998→present: era sections, station
 * banners at the inflection points, and origin-coloured artifact chips linking to evidence panels.
 */
import type { Station, TunnelArtifact } from '@/lib/queries/tunnel';
import styles from './tunnel.module.css';

const WESTERN = new Set([
  'US',
  'CA',
  'GB',
  'IE',
  'AU',
  'NZ',
  'DE',
  'FR',
  'ES',
  'IT',
  'NL',
  'BE',
  'SE',
  'NO',
  'DK',
  'FI',
  'AT',
  'CH',
  'PT',
  'LU',
]);
function region(code: string | null): 'w' | 'n' | 'o' {
  if (!code) return 'o';
  return WESTERN.has(code) ? 'w' : 'n';
}
function label(a: TunnelArtifact): string {
  if (a.title?.trim()) return a.title.length > 40 ? `${a.title.slice(0, 39)}…` : a.title;
  return [a.originCode, a.aiMediation].filter(Boolean).join(' · ') || 'untitled';
}

export function FlatTunnel({
  artifacts,
  stations,
}: {
  artifacts: TunnelArtifact[];
  stations: Station[];
}) {
  const byYear = new Map<number, TunnelArtifact[]>();
  for (const a of artifacts) {
    const y = a.year ?? 0;
    if (y <= 0) continue;
    const list = byYear.get(y) ?? [];
    list.push(a);
    byYear.set(y, list);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const stationByYear = new Map(
    stations.filter((s) => s.startYear).map((s) => [s.startYear as number, s])
  );

  return (
    <div className={styles.flatPage}>
      <header className={styles.flatHead}>
        <h1 className={styles.flatTitle}>The tunnel</h1>
        <p className={styles.flatSub}>
          Twenty-five years of cultural production as a corridor — 1998 to the present. When the
          technical floor of production drops to zero and origin becomes ambiguous, what determines
          which content travels diplomatically? This timeline is the flat, accessible reading.
          Each chip opens an evidence panel.{' '}
          <a href="/tunnel">Enter the 3D corridor →</a>
        </p>
      </header>

      {years.map((y) => {
        const station = stationByYear.get(y);
        const items = byYear.get(y) ?? [];
        return (
          <section key={y} className={styles.flatEra}>
            {station ? (
              <div className={styles.stationBanner}>
                <p className={styles.stationTitle}>{station.title}</p>
                {station.technicalMarker ? (
                  <p className={styles.stationMarker}>{station.technicalMarker}</p>
                ) : null}
                {station.description ? (
                  <p className={styles.stationDesc}>{station.description}</p>
                ) : null}
                <p className={styles.stationMeta}>
                  <a href="/methodology">Why this era matters →</a>
                  {station.interactiveVariables.length || station.comparativeGrids.length ? (
                    <> · {station.interactiveVariables.length} interactive variable(s) ·{' '}
                    {station.comparativeGrids.length} comparative grid(s) in the 3D view</>
                  ) : null}
                </p>
              </div>
            ) : null}
            <div className={styles.flatYearHead}>
              <span className={styles.flatYear}>{y}</span>
              <span className={styles.flatCount}>
                {items.length} artifact{items.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className={styles.flatTiles}>
              {items.map((a) => (
                <a
                  key={a.id}
                  href={`/artifact/${a.id}`}
                  className={styles.flatTile}
                  data-region={region(a.originCode)}
                  title={a.title ?? undefined}
                >
                  {label(a)}
                </a>
              ))}
            </div>
          </section>
        );
      })}

      <a className={styles.back} href="/">
        ← Origin Unknown
      </a>
    </div>
  );
}
