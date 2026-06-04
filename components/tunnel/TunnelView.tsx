'use client';

import type { Station, TunnelArtifact } from '@/lib/queries/tunnel';
import { evaluatePredicate } from '@/lib/utils/variable-filter';
/**
 * TunnelView — client wrapper for the 3D corridor. Detects WebGL + mobile and redirects those to the
 * `?mode=flat` 2D timeline; otherwise dynamically mounts the R3F scene (ssr:false). Overlays a
 * density sparkline, a live year/station readout, and — when the camera is near an era station with
 * interactive variables — the StationPanel, whose toggles/sliders filter the visible wall artifacts
 * (the Ciechanowski move) via their filter predicates.
 */
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { StationPanel } from './StationPanel';
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
  const [varOverrides, setVarOverrides] = useState<Record<string, number | boolean>>({});

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 820px)').matches;
    if (!hasWebgl() || mobile) {
      window.location.replace('/tunnel?mode=flat');
      return;
    }
    setReady(true);
  }, []);

  const activeStation = nearestStation(stations, year);
  const stationId = activeStation?.id;

  // A different station's variables shouldn't carry over.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the station changes
  useEffect(() => {
    setVarOverrides({});
  }, [stationId]);

  const hiddenIds = useMemo(() => {
    if (!activeStation) return null;
    const active = activeStation.interactiveVariables.filter(
      (v) => (varOverrides[v.id] ?? v.default) !== v.default
    );
    if (!active.length) return null;
    const hidden = new Set<string>();
    for (const a of artifacts) {
      const base = {
        year: a.year,
        reach: a.reach,
        ai_mediation: a.aiMediation,
        authorship: a.authorshipClass,
        has_c2pa: false,
      };
      for (const v of active) {
        const value = varOverrides[v.id] ?? v.default;
        const ok = evaluatePredicate(v.filter_predicate, {
          ...base,
          value: typeof value === 'number' ? value : undefined,
        });
        if (!ok) {
          hidden.add(a.id);
          break;
        }
      }
    }
    return hidden;
  }, [activeStation, varOverrides, artifacts]);

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
          hiddenIds={hiddenIds}
        />
      ) : (
        <div className={styles.detecting}>Loading the tunnel…</div>
      )}

      {ready && activeStation ? (
        <StationPanel
          station={activeStation}
          values={varOverrides}
          onChange={(id, v) => setVarOverrides((o) => ({ ...o, [id]: v }))}
        />
      ) : null}

      <Sparkline density={density} year={year} />
      <div className={styles.hud}>
        <p className={styles.hudYear}>{year}</p>
        {activeStation ? (
          <p className={styles.hudStation}>
            {activeStation.title}
            {activeStation.technicalMarker ? ` — ${activeStation.technicalMarker}` : ''}
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
