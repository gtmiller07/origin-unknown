'use client';

import type { Station, TunnelArtifact } from '@/lib/queries/tunnel';
import { evaluatePredicate } from '@/lib/utils/variable-filter';
/**
 * TunnelView — client wrapper for the 3D corridor (all 23 tunnel enhancements).
 *
 * Wave 2: #8 sparkline scrubber, #14 thesis color (data wired), #15 research findings banner.
 * Wave 3: #12 per-era framing, #13 guided/cinematic mode, #11 comparative grid claims.
 * Wave 4: #17 animated filter transitions, #18 axis-remap lens, #20 search/jump,
 *          #21 click-to-orbit inline panel, #22 deep-links.
 * Wave ongoing: #23 flat fallback narrative (in FlatTunnel.tsx).
 * #19 retire no-ops: done in seed-stations.ts.
 */
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ComparativeGrids } from './ComparativeGrids';
import { StationPanel } from './StationPanel';
import styles from './tunnel.module.css';

const TunnelScene = dynamic(() => import('./TunnelScene'), { ssr: false });

function hasWebgl(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function nearestStation(stations: Station[], year: number): Station | null {
  let best: Station | null = null;
  let bd = Number.POSITIVE_INFINITY;
  for (const s of stations) {
    if (s.startYear == null) continue;
    const d = Math.abs(s.startYear - year);
    if (d < bd && d <= 3) { bd = d; best = s; }
  }
  return best;
}

function zOfYear(year: number): number {
  const LENGTH = 60; const Y0 = 1998; const Y1 = 2026;
  return -(1 - (Math.max(Y0, Math.min(Y1, year)) - Y0) / (Y1 - Y0)) * LENGTH;
}

// ─── Sparkline with scrubbing (#8) ───────────────────────────────────────────

function Sparkline({
  density, year, onSeek,
}: {
  density: Array<{ year: number; count: number }>;
  year: number;
  onSeek: (year: number) => void;
}) {
  const W = 1000; const H = 34;
  const years: number[] = [];
  for (let y = 1998; y <= 2026; y++) years.push(y);
  const counts = new Map(density.map((d) => [d.year, d.count]));
  const max = Math.max(1, ...density.map((d) => d.count));
  const bw = W / years.length;
  const pressing = useRef(false);

  const seek = (clientX: number, svgEl: SVGSVGElement) => {
    const rect = svgEl.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const yr = Math.round(1998 + frac * (2026 - 1998));
    onSeek(yr);
  };

  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Artifact density by year — click to navigate"
      style={{ cursor: 'crosshair' }}
      onPointerDown={(e) => {
        pressing.current = true;
        seek(e.clientX, e.currentTarget);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => { if (pressing.current) seek(e.clientX, e.currentTarget); }}
      onPointerUp={() => { pressing.current = false; }}
    >
      {years.map((y, i) => {
        const c = counts.get(y) ?? 0;
        const h = Math.max(1, (c / max) * H);
        return (
          <rect
            key={y}
            className={y === year ? styles.sparkBarOn : styles.sparkBar}
            x={i * bw + 0.5} y={H - h} width={bw - 1} height={h}
          />
        );
      })}
    </svg>
  );
}

// ─── Per-era framing card (#12) ───────────────────────────────────────────────

function EraFrameCard({ station }: { station: Station | null }) {
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (!station || station.id === shown) return;
    setShown(station.id);
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 4500);
    return () => clearTimeout(t);
  }, [station, shown]);

  if (!station || !visible) return null;
  return (
    <div
      className={styles.eraFrame}
      role="status"
      aria-live="polite"
      onClick={() => setVisible(false)}
    >
      <p className={styles.eraFrameTitle}>{station.title}</p>
      {station.description ? <p className={styles.eraFrameDesc}>{station.description}</p> : null}
      <button type="button" className={styles.eraFrameDismiss} onClick={() => setVisible(false)}>×</button>
    </div>
  );
}

// ─── Research findings banner (#15) ──────────────────────────────────────────

function FindingsBanner({ year }: { year: number }) {
  const [opacity, setOpacity] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setOpacity(year >= 2022 ? 1 : 0), 50);
    return () => clearTimeout(t);
  }, [year]);
  if (year < 2020) return null;
  return (
    <div
      className={styles.finding}
      style={{ opacity, transition: 'opacity 1.5s ease' }}
      aria-live="polite"
    >
      <span className={styles.findingLabel}>finding</span>
      AI mediation amplifies non-Western authenticity: 0.41 vs 0.21 — a 0.20 gap vs. 0.04 in human-made content.
    </div>
  );
}

// ─── Search / jump-to-artifact (#20) ─────────────────────────────────────────

function ArtifactSearch({
  artifacts,
  onSelect,
  visible,
  onClose,
}: {
  artifacts: TunnelArtifact[];
  onSelect: (year: number) => void;
  visible: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    if (!q.trim()) return [];
    const lq = q.toLowerCase();
    return artifacts.filter((a) => a.title?.toLowerCase().includes(lq)).slice(0, 6);
  }, [q, artifacts]);

  if (!visible) return null;
  return (
    <div className={styles.search}>
      <input
        className={styles.searchInput}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search artifacts… (Esc to close)"
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Escape') { onClose(); setQ(''); } }}
      />
      {results.length > 0 && (
        <ul className={styles.searchResults}>
          {results.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className={styles.searchResult}
                onClick={() => {
                  if (a.year) onSelect(a.year);
                  setQ('');
                  onClose();
                }}
              >
                <span className={styles.searchResultYear}>{a.year}</span>
                {a.title ?? 'Untitled'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Axis-remap lens (#18) ────────────────────────────────────────────────────

type ColorAxis = 'origin' | 'aiMediation' | 'authorship';
const COLOR_AXES: Array<{ id: ColorAxis; label: string }> = [
  { id: 'origin', label: 'Geography' },
  { id: 'aiMediation', label: 'AI mediation' },
  { id: 'authorship', label: 'Authorship' },
];

// ─── Click-to-orbit inline panel (#21) ───────────────────────────────────────

function ArtifactPanel({
  artifact,
  onClose,
}: {
  artifact: TunnelArtifact;
  onClose: () => void;
}) {
  const axes: Array<{ key: keyof TunnelArtifact; label: string }> = [
    { key: 'origin', label: 'Origin clarity' },
    { key: 'reach', label: 'Reach' },
    { key: 'aesthetic', label: 'Aesthetic signal' },
    { key: 'crossboundary', label: 'Crosses boundaries' },
    { key: 'authenticity', label: 'Authenticity' },
    { key: 'reciprocity', label: 'Reciprocity' },
  ];
  return (
    <div className={styles.orbitPanel}>
      <button type="button" className={styles.orbitClose} onClick={onClose} aria-label="Close">×</button>
      {artifact.thumbnailUrl ? (
        <img
          src={artifact.thumbnailUrl}
          alt={artifact.title ?? ''}
          className={styles.orbitThumb}
          loading="lazy"
        />
      ) : (
        <div className={styles.orbitThumbEmpty}>{artifact.aiMediation ?? 'artifact'}</div>
      )}
      <p className={styles.orbitTitle}>{artifact.title ?? 'Untitled'}</p>
      <dl className={styles.orbitMeta}>
        <div><dt>Year</dt><dd>{artifact.year ?? '—'}</dd></div>
        <div><dt>Origin</dt><dd>{artifact.originCode ?? '—'}</dd></div>
        <div><dt>AI</dt><dd>{artifact.aiMediation ?? '—'}</dd></div>
      </dl>
      <ul className={styles.orbitAxes}>
        {axes.map(({ key, label }) => {
          const v = artifact[key] as number | null;
          if (v == null) return null;
          return (
            <li key={key}>
              <span className={styles.orbitAxisLabel}>{label}</span>
              <div className={styles.orbitBar}>
                <div className={styles.orbitBarFill} style={{ width: `${Math.round(v * 100)}%` }} />
                <span className={styles.orbitBarNum}>{v.toFixed(2)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <a href={`/artifact/${artifact.id}`} className={styles.orbitLink}>
        Full evidence panel →
      </a>
    </div>
  );
}

// ─── Guided/cinematic mode (#13) ──────────────────────────────────────────────

function useGuidedMode(
  enabled: boolean,
  stations: Station[],
  seekRef: React.MutableRefObject<number | null>,
  setShowNarrative: (v: boolean) => void,
) {
  useEffect(() => {
    if (!enabled || !stations.length) return;
    const ordered = [...stations].filter((s) => s.startYear != null).sort((a, b) => (a.startYear ?? 0) - (b.startYear ?? 0));
    let cancelled = false;

    async function run() {
      // Start from 1998
      seekRef.current = zOfYear(1998);
      await delay(1500);
      for (const station of ordered) {
        if (cancelled) return;
        if (station.startYear == null) continue;
        // Travel to station
        seekRef.current = zOfYear(station.startYear);
        await delay(4000); // travel time
        if (cancelled) return;
        setShowNarrative(true);
        await delay(4500); // pause + show description
        if (cancelled) return;
        setShowNarrative(false);
        await delay(500);
      }
      // Travel to 2026 exit
      if (!cancelled) seekRef.current = zOfYear(2026);
    }

    run();
    return () => { cancelled = true; };
  }, [enabled, stations, seekRef, setShowNarrative]);
}

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// ─── Main TunnelView ─────────────────────────────────────────────────────────

export function TunnelView({
  artifacts,
  stations,
  density,
  initialYear = null,
  focusArtifactId = null,
  guidedMode = false,
}: {
  artifacts: TunnelArtifact[];
  stations: Station[];
  density: Array<{ year: number; count: number }>;
  initialYear?: number | null;
  focusArtifactId?: string | null;
  guidedMode?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [year, setYear] = useState(initialYear ?? 1998);
  const [varOverrides, setVarOverrides] = useState<Record<string, number | boolean>>({});
  const [colorAxis, setColorAxis] = useState<ColorAxis>('origin');
  const [searchVisible, setSearchVisible] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<TunnelArtifact | null>(null);
  const [showNarrative, setShowNarrative] = useState(false);

  // Shared seek ref: written by sparkline, guided mode, deep-links; read by CameraRig.
  const seekRef = useRef<number | null>(initialYear ? zOfYear(initialYear) : null);

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 820px)').matches;
    if (!hasWebgl() || mobile) {
      window.location.replace('/tunnel?mode=flat');
      return;
    }
    setReady(true);
  }, []);

  // Deep-link: focus on a specific artifact by id (#22).
  useEffect(() => {
    if (!focusArtifactId) return;
    const a = artifacts.find((x) => x.id === focusArtifactId);
    if (a?.year) seekRef.current = zOfYear(a.year);
  }, [focusArtifactId, artifacts]);

  // Keyboard shortcut: '/' opens search (#20).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !searchVisible && e.target === document.body) {
        e.preventDefault();
        setSearchVisible(true);
      }
      if (e.key === 'Escape') setSearchVisible(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchVisible]);

  // Guided mode state machine (#13).
  useGuidedMode(guidedMode, stations, seekRef, setShowNarrative);

  const activeStation = nearestStation(stations, year);
  const stationId = activeStation?.id;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when station changes
  useEffect(() => { setVarOverrides({}); }, [stationId]);

  const hiddenIds = useMemo(() => {
    if (!activeStation) return null;
    const active = activeStation.interactiveVariables.filter(
      (v) => (varOverrides[v.id] ?? v.default) !== v.default
    );
    if (!active.length) return null;
    const hidden = new Set<string>();
    for (const a of artifacts) {
      const base = {
        year: a.year, reach: a.reach,
        ai_mediation: a.aiMediation, authorship: a.authorshipClass, has_c2pa: false,
      };
      for (const v of active) {
        const value = varOverrides[v.id] ?? v.default;
        const ok = evaluatePredicate(v.filter_predicate, {
          ...base, value: typeof value === 'number' ? value : undefined,
        });
        if (!ok) { hidden.add(a.id); break; }
      }
    }
    return hidden;
  }, [activeStation, varOverrides, artifacts]);

  const eraArtifacts = useMemo(() => {
    const st = activeStation;
    if (!st || !st.comparativeGrids.length || st.startYear == null) return [];
    const lo = st.startYear;
    const next = stations.map((s) => s.startYear).filter((y): y is number => y != null)
      .sort((a, b) => a - b).find((y) => y > lo);
    return artifacts.filter((a) => a.year != null && a.year >= lo && a.year < (next ?? 9999));
  }, [activeStation, stations, artifacts]);

  const handleTileSelect = (id: string) => {
    const a = artifacts.find((x) => x.id === id);
    if (a) setSelectedArtifact(a);
  };

  return (
    <div className={styles.stage}>
      {ready ? (
        <TunnelScene
          artifacts={artifacts}
          stations={stations}
          onSelect={handleTileSelect}
          onYear={setYear}
          hiddenIds={hiddenIds}
          density={density}
          seekRef={seekRef}
          colorAxis={colorAxis}
        />
      ) : (
        <div className={styles.detecting}>Loading the tunnel…</div>
      )}

      {/* Per-era framing card (#12) */}
      {ready ? <EraFrameCard station={activeStation} /> : null}

      {/* Station interactive variables panel */}
      {ready && activeStation ? (
        <StationPanel
          station={activeStation}
          values={varOverrides}
          onChange={(id, v) => setVarOverrides((o) => ({ ...o, [id]: v }))}
        />
      ) : null}

      {/* Comparative grids (#11 + claims) */}
      {ready && activeStation && activeStation.comparativeGrids.length ? (
        <ComparativeGrids
          grids={activeStation.comparativeGrids}
          artifacts={eraArtifacts}
          onSelect={(id) => { window.location.href = `/artifact/${id}`; }}
        />
      ) : null}

      {/* Click-to-orbit artifact panel (#21) */}
      {selectedArtifact ? (
        <ArtifactPanel artifact={selectedArtifact} onClose={() => setSelectedArtifact(null)} />
      ) : null}

      {/* Guided narrative overlay (#13) */}
      {guidedMode && showNarrative && activeStation?.description ? (
        <div className={styles.guidedNarrative} aria-live="polite">
          <p className={styles.guidedTitle}>{activeStation.title}</p>
          <p className={styles.guidedDesc}>{activeStation.description}</p>
        </div>
      ) : null}

      {/* Search (#20) */}
      <ArtifactSearch
        artifacts={artifacts}
        onSelect={(yr) => { seekRef.current = zOfYear(yr); }}
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
      />

      {/* Sparkline scrubber (#8) */}
      <Sparkline density={density} year={year} onSeek={(yr) => { seekRef.current = zOfYear(yr); }} />

      {/* Research findings banner (#15) */}
      {ready ? <FindingsBanner year={year} /> : null}

      {/* HUD */}
      <div className={styles.hud}>
        <p className={styles.hudYear}>{year}</p>
        {activeStation ? (
          <p className={styles.hudStation}>
            {activeStation.title}
            {activeStation.technicalMarker ? ` — ${activeStation.technicalMarker}` : ''}
            {activeStation.artifactDensity ? ` · ${activeStation.artifactDensity}` : ''}
          </p>
        ) : null}
        <p className={styles.hudHint}>
          scroll / arrows to travel 1998 → 2026 · click an artifact ·{' '}
          <button type="button" className={styles.hudBtn} onClick={() => setSearchVisible(true)}>/ search</button>
          {' · '}<a href="/tunnel?mode=flat">flat view</a>
          {' · '}{guidedMode ? null : <a href="/tunnel?mode=play">▶ play tour</a>}
        </p>
      </div>

      {/* Axis-remap lens (#18) */}
      <div className={styles.axisRemap}>
        {COLOR_AXES.map((ax) => (
          <button
            key={ax.id}
            type="button"
            className={colorAxis === ax.id ? styles.axisRemapOn : styles.axisRemapBtn}
            onClick={() => setColorAxis(ax.id)}
          >
            {ax.label}
          </button>
        ))}
      </div>
    </div>
  );
}
