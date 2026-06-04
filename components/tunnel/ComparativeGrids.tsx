'use client';

import { Thumbnail } from '@/components/evidence/Thumbnail';
import type { ComparativeGridSpec, TunnelArtifact } from '@/lib/queries/tunnel';
/**
 * ComparativeGrids — the station "comparative grid moment" (Stage B). For the era a station opens, it
 * groups that era's artifacts by the grid's group_by field, sorts each group by sort_by, caps at
 * max_per_group, and lays them out as a grid or strip. An HTML overlay (not in the Canvas); clicking a
 * cell opens the evidence panel. Thumbnails fall back to a titled placeholder, so seeded past-era
 * artifacts (which carry no thumbnail yet) still read.
 */
import { useState } from 'react';
import styles from './tunnel.module.css';

function shortTitle(t: string | null): string {
  if (!t) return 'untitled';
  const w = t.trim().split(/\s+/);
  return w.length <= 5 ? t : `${w.slice(0, 5).join(' ')}…`;
}

/** Resolve the group key for an artifact from the grid's group_by field, or null to skip. */
function groupKey(a: TunnelArtifact, groupBy: string): string | null {
  if (groupBy.startsWith('origin')) return a.originCode;
  if (groupBy.startsWith('language')) return a.languageCode;
  if (groupBy.includes('model') || groupBy.includes('ai_')) return a.aiMediation;
  if (groupBy.includes('authorship')) return a.authorshipClass;
  return 'All';
}

function sortValue(a: TunnelArtifact, sortBy: string): number {
  if (sortBy.includes('aesthetic')) return a.aesthetic ?? 0;
  if (sortBy.includes('reach')) return a.reach ?? 0;
  return a.year ?? 0; // published_at and anything else
}

function GridBody({
  grid,
  artifacts,
  onSelect,
}: {
  grid: ComparativeGridSpec;
  artifacts: TunnelArtifact[];
  onSelect: (id: string) => void;
}) {
  const groups = new Map<string, TunnelArtifact[]>();
  for (const a of artifacts) {
    const k = groupKey(a, grid.group_by);
    if (!k) continue; // skip artifacts missing the grouping metadata
    const arr = groups.get(k);
    if (arr) arr.push(a);
    else groups.set(k, [a]);
  }
  const entries = [...groups.entries()]
    .map(
      ([k, list]) =>
        [
          k,
          [...list].sort((x, y) => sortValue(y, grid.sort_by) - sortValue(x, grid.sort_by)).slice(0, grid.max_per_group),
        ] as const
    )
    .sort((a, b) => b[1].length - a[1].length);

  if (!entries.length) {
    return <p className={styles.cmpEmpty}>Not enough metadata in this era to compare yet.</p>;
  }

  return (
    <div className={styles.cmpPanel}>
      <p className={styles.cmpDesc}>{grid.description}</p>
      {entries.map(([k, list]) => (
        <div key={k} className={styles.cmpGroup}>
          <p className={styles.cmpGroupLabel}>
            {k} <span className={styles.cmpCount}>{list.length}</span>
          </p>
          <div className={grid.layout === 'strip' ? styles.cmpStrip : styles.cmpGrid}>
            {list.map((a) => (
              <button
                key={a.id}
                type="button"
                className={styles.cmpCell}
                onClick={() => onSelect(a.id)}
                title={a.title ?? ''}
              >
                <Thumbnail
                  src={a.thumbnailUrl}
                  alt={a.title ?? ''}
                  imgClassName={styles.cmpThumb}
                  emptyClassName={styles.cmpThumbEmpty}
                  emptyLabel={shortTitle(a.title)}
                />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ComparativeGrids({
  grids,
  artifacts,
  onSelect,
}: {
  grids: ComparativeGridSpec[];
  artifacts: TunnelArtifact[];
  onSelect: (id: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!grids.length) return null;
  const open = grids.find((g) => g.id === openId) ?? null;

  return (
    <div className={styles.cmpWrap}>
      <div className={styles.cmpTabs}>
        <span className={styles.cmpTitle}>Compare this era</span>
        {grids.map((g) => (
          <button
            key={g.id}
            type="button"
            className={openId === g.id ? styles.cmpTabOn : styles.cmpTab}
            onClick={() => setOpenId(openId === g.id ? null : g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>
      {open ? <GridBody grid={open} artifacts={artifacts} onSelect={onSelect} /> : null}
    </div>
  );
}
