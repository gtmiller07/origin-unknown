'use client';

import type { LiveStatus, Particle } from '@/lib/queries/ambient';
/**
 * LiveField — client wrapper for the ambient field. Dynamically imports the R3F canvas with
 * ssr:false (three needs the browser), detects WebGL and reduced-motion, overlays the dissertation
 * question and the live HUD, and degrades to a list link where WebGL is unavailable.
 */
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { DissertationQuestion } from './DissertationQuestion';
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

export function LiveField({ particles, status }: { particles: Particle[]; status: LiveStatus }) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setOk(detectWebgl());
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  return (
    <div className={styles.stage}>
      {ok === false ? (
        <div className={styles.noGl}>
          <p>The ambient field needs WebGL, which isn’t available in this browser.</p>
          <a href="/live?view=list">View the live list →</a>
        </div>
      ) : null}
      {ok ? (
        <>
          <AmbientField particles={particles} reducedMotion={reduced} />
          <DissertationQuestion />
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
