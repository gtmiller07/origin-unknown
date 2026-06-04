'use client';

import type { LiveStatus, Particle } from '@/lib/queries/ambient';
/**
 * LiveField — client wrapper for the ambient field. Dynamically imports the R3F canvas (ssr:false),
 * detects WebGL + reduced-motion, holds the hover state, and overlays the legend, the hover
 * scorecard, the dissertation question, and the live HUD. Clicking a particle opens its evidence
 * panel. Degrades to a list link where WebGL is unavailable.
 */
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { DissertationQuestion } from './DissertationQuestion';
import { HoverCard } from './HoverCard';
import { Legend } from './Legend';
import styles from './ambient.module.css';

const AmbientField = dynamic(() => import('./AmbientField'), { ssr: false });

function detectWebgl(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

interface HoverState {
  particle: Particle;
  x: number;
  y: number;
}

export function LiveField({ particles, status }: { particles: Particle[]; status: LiveStatus }) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [reduced, setReduced] = useState(false);
  const [hover, setHover] = useState<HoverState | null>(null);

  useEffect(() => {
    setOk(detectWebgl());
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  const onHover = (index: number | null, x: number, y: number) => {
    if (index == null) {
      setHover(null);
      return;
    }
    const p = particles[index];
    if (p) setHover({ particle: p, x, y });
  };
  const onSelect = (id: string) => {
    window.location.href = `/artifact/${id}`;
  };

  return (
    <div className={styles.stage} style={{ cursor: hover ? 'pointer' : 'default' }}>
      {ok === false ? (
        <div className={styles.noGl}>
          <p>The ambient field needs WebGL, which isn’t available in this browser.</p>
          <a href="/live?view=list">View the live list →</a>
        </div>
      ) : null}
      {ok ? (
        <>
          <AmbientField
            particles={particles}
            reducedMotion={reduced}
            onHover={onHover}
            onSelect={onSelect}
          />
          <Legend />
          <DissertationQuestion />
          {hover ? <HoverCard particle={hover.particle} x={hover.x} y={hover.y} /> : null}
        </>
      ) : null}
      <div className={styles.hud}>
        <p className={styles.hudLine}>
          <span className={styles.hudNum}>{status.scored.toLocaleString()}</span> scored ·{' '}
          <span className={styles.hudNum}>{status.artifacts.toLocaleString()}</span> ingested ·{' '}
          <span className={styles.hudNum}>{status.sources}</span> sources
        </p>
        <a className={styles.hudLink} href="/live?view=list">
          list view
        </a>
      </div>
    </div>
  );
}
