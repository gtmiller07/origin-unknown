'use client';

import type { Station, TunnelArtifact } from '@/lib/queries/tunnel';
/**
 * TunnelView — client wrapper for the 3D corridor. Detects WebGL + mobile and redirects those to
 * the `?mode=flat` 2D timeline; otherwise dynamically mounts the R3F scene (ssr:false). Overlays a
 * density sparkline (the content explosion, by year), a live year readout with the nearest era
 * station, and the controls hint. Clicking an artifact opens its evidence panel.
 */
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import styles from './tunnel.module.css';

const TunnelScene = dynamic(() => import('./TunnelScene'), { ssr: false });

function hasWebgl(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function nearestStation(stations: Station[], year: number): Station | null {
  let best: Station | null = null;
  let bd = Number.POSITIVE_INFINITY;
  for (const s of stations) {
    if (s.startYear == null) continue;
    const d = Math.abs(s.startYear - year);
    if (d < bd && d <= 3) {
      bd = d;
      best = s;
    }
  }
  return best;
}

function Sparkline({
  density,
  year,
}: {
  density: Array<{ year: number; count: number }>;
  year: number;
}) {
  const W = 1000;
  const H = 34;
  const years: number[] = [];
  for (let y = 1998; y <= 2026; y++) years.push(y);
  const counts = new Map(density.map((d) => [d.year, d.count]));
  const max = Math.max(1, ...density.map((d) => d.count));
  const bw = W / years.length;
  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Artifact density by year"
    >
      {years.map((y, i) => {
        const c = counts.get(y) ?? 0;
        const h = Math.max(1, (c / max) * H);
        return (
          <rect
            key={y}
            className={y === year ? styles.sparkBarOn : styles.sparkBar}
            x={i * bw + 0.5}
            y={H - h}
            width={bw - 1}
            height={h}
          />
        );
      })}
    </svg>
  );
}

export function TunnelView({
  artifacts,
  stations,
  density,
}: {
  artifacts: TunnelArtifact[];
  stations: Station[];
  density: Array<{ year: number; count: number }>;
}) {
  const [ready, setReady] = useState(false);
  const [year, setYear] = useState(1998);

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 820px)').matches;
    if (!hasWebgl() || mobile) {
      window.location.replace('/tunnel?mode=flat');
      return;
    }
    setReady(true);
  }, []);

  const near = nearestStation(stations, year);

  return (
    <div className={styles.stage}>
      {ready ? (
        <TunnelScene
          artifacts={artifacts}
          stations={stations}
          onSelect={(id) => {
            window.location.href = `/artifact/${id}`;
          }}
          onYear={setYear}
        />
      ) : (
        <div className={styles.detecting}>Loading the tunnel…</div>
      )}
      <Sparkline density={density} year={year} />
      <div className={styles.hud}>
        <p className={styles.hudYear}>{year}</p>
        {near ? (
          <p className={styles.hudStation}>
            {near.title}
            {near.technicalMarker ? ` — ${near.technicalMarker}` : ''}
          </p>
        ) : null}
        <p className={styles.hudHint}>
          scroll / arrows to travel 1998 → 2026 · click an artifact ·{' '}
          <a href="/tunnel?mode=flat">flat view</a>
        </p>
      </div>
    </div>
  );
}
