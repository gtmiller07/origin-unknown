'use client';

import type { Station, TunnelArtifact } from '@/lib/queries/tunnel';
/**
 * TunnelScene — the R3F corridor. Z is time (1998 at z=-LENGTH → 2026 at z=0).
 *
 * Wave 1 enhancements (all 23 tunnel improvements, wave 1):
 *  #1  Depth fog — THREE.Fog fades corridor into darkness; the past is a void you advance into.
 *  #2  Floating tiles — per-artifact sine drift on Y, phase from hash01(id) so each floats independently.
 *  #3  Slit-scan streak — fast camera movement stretches tile scale.z, Kubrick Star Gate reference.
 *  #4  Parallax dust — AmbientParticles layer at r=0.2–0.6 follows camera at 60% speed.
 *  #5  Richer skin — doubled longitudinal struts + sub-era rings every 2 years.
 *  #7  Density glow — rings glow brighter at high-density years; eye is pulled to dense bands.
 *
 * Wave 2 enhancements wired here (require data from Pre-req A):
 *  #14 Thesis color drift — tile color desaturates as origin score drops (clear→vivid, ambiguous→gray).
 *  #6  Data-driven radius — density array nudges r(z) control points toward real counts.
 *
 * Wave 3:
 *  #16 Dissolve into field — when camera passes z=2 (beyond 2026 exit), scatter tiles and navigate to /live.
 */
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

const LENGTH = 60;
const Y0 = 1998;
const Y1 = 2026;

// Base control points — blended with data-driven density in computeRadius (Wave 2 #6).
const BASE_CONTROL: Array<[number, number]> = [
  [1998, 1.0],
  [2005, 1.4],
  [2012, 2.0],
  [2018, 2.7],
  [2022, 3.2],
  [2026, 3.5],
];

/** Build a radius lookup that blends the base curve with actual per-year density (#6). */
function buildRadiusFn(density: Array<{ year: number; count: number }>): (year: number) => number {
  if (!density.length) return rOfYearBase;
  const counts = new Map(density.map((d) => [d.year, d.count]));
  const max = Math.max(1, ...density.map((d) => d.count));
  // Smooth a 3-year rolling average for the nudge.
  const smoothed = new Map<number, number>();
  for (const { year } of density) {
    const avg = ((counts.get(year - 1) ?? 0) + (counts.get(year) ?? 0) + (counts.get(year + 1) ?? 0)) / 3;
    smoothed.set(year, avg);
  }
  return (year: number): number => {
    const base = rOfYearBase(year);
    const yr = Math.round(Math.max(Y0, Math.min(Y1, year)));
    const norm = (smoothed.get(yr) ?? 0) / max; // 0..1
    // Nudge: blend 75% base + 25% density-mapped to [0.8, 3.5]
    const densityR = 0.8 + norm * 2.7;
    return base * 0.75 + densityR * 0.25;
  };
}

function rOfYearBase(year: number): number {
  const y = Math.max(Y0, Math.min(Y1, year));
  for (let i = 0; i < BASE_CONTROL.length - 1; i++) {
    const a = BASE_CONTROL[i];
    const b = BASE_CONTROL[i + 1];
    if (a && b && y >= a[0] && y <= b[0]) {
      const t = (y - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return 3.5;
}

function yearNorm(year: number): number {
  return (Math.max(Y0, Math.min(Y1, year)) - Y0) / (Y1 - Y0);
}
function zOfYear(year: number): number {
  return -(1 - yearNorm(year)) * LENGTH;
}
function rOfZ(z: number, rFn: (y: number) => number): number {
  return rFn(Y0 + (1 + z / LENGTH) * (Y1 - Y0));
}

const WESTERN = new Set([
  'US','CA','GB','IE','AU','NZ','DE','FR','ES','IT',
  'NL','BE','SE','NO','DK','FI','AT','CH','PT','LU',
]);
function isWestern(code: string | null): boolean {
  return code ? WESTERN.has(code) : false;
}
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shared world-space placement for a tile. Angle driven by origin side + stable jitter. */
function tileTransform(
  a: TunnelArtifact,
  rFn: (y: number) => number
): { x: number; y: number; z: number; scale: number; ang: number } {
  const yr = a.year ?? Y1;
  const z = zOfYear(yr);
  const r = rFn(yr) * 0.9;
  const rnd = hash01(a.id);
  const base = a.originCode ? (isWestern(a.originCode) ? Math.PI : 0) : rnd < 0.5 ? Math.PI : 0;
  const ang = base + (rnd - 0.5) * Math.PI * 0.85;
  return { x: r * Math.cos(ang), y: r * Math.sin(ang), z, scale: 0.5 + rFn(yr) * 0.16, ang };
}

/**
 * Tile color with axis-remap (#18) + thesis-encoded desaturation (#14).
 * colorAxis='origin' (default): Western terracotta / non-Western teal, desaturated by origin score.
 * colorAxis='aiMediation': human=blue, ai_generated=magenta, ai_assisted=yellow, unknown=gray.
 * colorAxis='authorship': individual=teal, commercial=amber, state=red, community=green.
 */
function tileColor(a: TunnelArtifact, colorAxis: 'origin' | 'aiMediation' | 'authorship'): THREE.Color {
  const gray = new THREE.Color(0.5, 0.5, 0.5);

  if (colorAxis === 'aiMediation') {
    const palette: Record<string, THREE.Color> = {
      human_made: new THREE.Color(0.2, 0.45, 0.75),       // blue
      ai_generated: new THREE.Color(0.75, 0.2, 0.65),     // magenta
      ai_assisted: new THREE.Color(0.75, 0.65, 0.1),      // yellow
      unknown: gray,
    };
    return palette[a.aiMediation ?? ''] ?? gray;
  }

  if (colorAxis === 'authorship') {
    const palette: Record<string, THREE.Color> = {
      individual_creator: new THREE.Color(0.27, 0.62, 0.56),      // teal
      commercial_institutional: new THREE.Color(0.72, 0.55, 0.1), // amber
      state_affiliated: new THREE.Color(0.72, 0.2, 0.2),          // red
      community_collective: new THREE.Color(0.2, 0.6, 0.3),       // green
      ambiguous_unattributable: gray,
    };
    return palette[a.authorshipClass ?? ''] ?? gray;
  }

  // Default: origin geography + thesis desaturation (#14)
  const west = new THREE.Color(0.72, 0.36, 0.23);
  const non = new THREE.Color(0.27, 0.62, 0.56);
  const base = a.originCode ? (isWestern(a.originCode) ? west : non) : gray;
  if (a.origin == null) return base;
  return new THREE.Color(
    lerp(gray.r, base.r, a.origin),
    lerp(gray.g, base.g, a.origin),
    lerp(gray.b, base.b, a.origin),
  );
}

// ─── Corridor geometry (#5 richer skin) ──────────────────────────────────────

function Corridor({ rFn }: { rFn: (y: number) => number }) {
  const geometry = useMemo(() => {
    const segZ = 40;
    const segR = 32; // denser rings
    const pos: number[] = [];
    // Rings
    for (let i = 0; i <= segZ; i++) {
      const z = -(i / segZ) * LENGTH;
      const r = rOfZ(z, rFn);
      for (let j = 0; j < segR; j++) {
        const a0 = (j / segR) * Math.PI * 2;
        const a1 = ((j + 1) / segR) * Math.PI * 2;
        pos.push(r * Math.cos(a0), r * Math.sin(a0), z, r * Math.cos(a1), r * Math.sin(a1), z);
      }
    }
    // Primary longitudinal struts (8)
    const longPrimary = 8;
    for (let j = 0; j < longPrimary; j++) {
      const a = (j / longPrimary) * Math.PI * 2;
      for (let i = 0; i < segZ; i++) {
        const z0 = -(i / segZ) * LENGTH;
        const z1 = -((i + 1) / segZ) * LENGTH;
        pos.push(rOfZ(z0, rFn)*Math.cos(a), rOfZ(z0, rFn)*Math.sin(a), z0,
                 rOfZ(z1, rFn)*Math.cos(a), rOfZ(z1, rFn)*Math.sin(a), z1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [rFn]);

  // Secondary struts (8 more, offset by half-step, lighter)
  const secondaryGeo = useMemo(() => {
    const segZ = 40;
    const longSecondary = 8;
    const pos: number[] = [];
    for (let j = 0; j < longSecondary; j++) {
      const a = ((j + 0.5) / longSecondary) * Math.PI * 2;
      for (let i = 0; i < segZ; i++) {
        const z0 = -(i / segZ) * LENGTH;
        const z1 = -((i + 1) / segZ) * LENGTH;
        pos.push(rOfZ(z0, rFn)*Math.cos(a), rOfZ(z0, rFn)*Math.sin(a), z0,
                 rOfZ(z1, rFn)*Math.cos(a), rOfZ(z1, rFn)*Math.sin(a), z1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [rFn]);

  const mat = useMemo(() => new THREE.LineBasicMaterial({ color: 0x4a4a4a, transparent: true, opacity: 0.35 }), []);
  const mat2 = useMemo(() => new THREE.LineBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.18 }), []);
  useEffect(() => () => { geometry.dispose(); secondaryGeo.dispose(); mat.dispose(); mat2.dispose(); },
    [geometry, secondaryGeo, mat, mat2]);
  return (
    <>
      <lineSegments geometry={geometry} material={mat} />
      <lineSegments geometry={secondaryGeo} material={mat2} />
    </>
  );
}

// Sub-era rings every 2 years (#5)
function SubEraRings({ rFn }: { rFn: (y: number) => number }) {
  const geometry = useMemo(() => {
    const segR = 24;
    const pos: number[] = [];
    for (let yr = Y0; yr <= Y1; yr += 2) {
      const z = zOfYear(yr);
      const r = rOfZ(z, rFn) * 1.01;
      for (let j = 0; j < segR; j++) {
        const a0 = (j / segR) * Math.PI * 2;
        const a1 = ((j + 1) / segR) * Math.PI * 2;
        pos.push(r*Math.cos(a0), r*Math.sin(a0), z, r*Math.cos(a1), r*Math.sin(a1), z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [rFn]);
  const mat = useMemo(() => new THREE.LineBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.1 }), []);
  useEffect(() => () => { geometry.dispose(); mat.dispose(); }, [geometry, mat]);
  return <lineSegments geometry={geometry} material={mat} />;
}

// Station accent rings (era markers)
function StationRings({ stations, rFn }: { stations: Station[]; rFn: (y: number) => number }) {
  const geometry = useMemo(() => {
    const segR = 48;
    const pos: number[] = [];
    for (const s of stations) {
      const z = -(1 - s.position) * LENGTH;
      const r = rOfZ(z, rFn) * 1.03;
      for (let j = 0; j < segR; j++) {
        const a0 = (j / segR) * Math.PI * 2;
        const a1 = ((j + 1) / segR) * Math.PI * 2;
        pos.push(r*Math.cos(a0), r*Math.sin(a0), z, r*Math.cos(a1), r*Math.sin(a1), z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [stations, rFn]);
  const mat = useMemo(() => new THREE.LineBasicMaterial({ color: 0xb85c3b, transparent: true, opacity: 0.7 }), []);
  useEffect(() => () => { geometry.dispose(); mat.dispose(); }, [geometry, mat]);
  return <lineSegments geometry={geometry} material={mat} />;
}

// Density glow rings at high-count years (#7)
function DensityGlow({ density, rFn }: { density: Array<{ year: number; count: number }>; rFn: (y: number) => number }) {
  const geometry = useMemo(() => {
    if (!density.length) return null;
    const max = Math.max(1, ...density.map((d) => d.count));
    const threshold = max * 0.12;
    const segR = 36;
    const pos: number[] = [];
    for (const { year, count } of density) {
      if (count < threshold) continue;
      const z = zOfYear(year);
      const r = rOfZ(z, rFn) * 1.05;
      for (let j = 0; j < segR; j++) {
        const a0 = (j / segR) * Math.PI * 2;
        const a1 = ((j + 1) / segR) * Math.PI * 2;
        pos.push(r*Math.cos(a0), r*Math.sin(a0), z, r*Math.cos(a1), r*Math.sin(a1), z);
      }
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [density, rFn]);

  const mat = useMemo(() => new THREE.LineBasicMaterial({
    color: 0xb85c3b, transparent: true, opacity: 0.18,
    blending: THREE.AdditiveBlending,
  }), []);

  useEffect(() => () => { geometry?.dispose(); mat.dispose(); }, [geometry, mat]);
  if (!geometry) return null;
  return <lineSegments geometry={geometry} material={mat} />;
}

// ─── Animated instanced quads (#2 float + #3 streak) ─────────────────────────

interface TileBase {
  x: number; y: number; z: number; scale: number;
  phase: number; speed: number; hidden: boolean;
}

function Tiles({
  artifacts,
  onSelect,
  hiddenIds,
  velocityRef,
  rFn,
  colorAxis,
}: {
  artifacts: TunnelArtifact[];
  onSelect: (id: string) => void;
  hiddenIds: Set<string> | null;
  velocityRef: React.MutableRefObject<number>;
  rFn: (y: number) => number;
  colorAxis: 'origin' | 'aiMediation' | 'authorship';
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const basesRef = useRef<TileBase[]>([]);
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    []
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: rFn is a stable memoized fn
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    // Recompute base transforms + drift params + hidden state.
    basesRef.current = artifacts.map((a) => {
      const { x, y, z, scale } = tileTransform(a, rFn);
      return {
        x, y, z, scale,
        phase: hash01(a.id) * Math.PI * 2,
        speed: 0.28 + hash01(a.id + 's') * 0.15,
        hidden: hiddenIds?.has(a.id) ?? false,
      };
    });
    // Set colors (matrices set by useFrame). Re-runs when colorAxis changes.
    artifacts.forEach((a, i) => {
      mesh.setColorAt(i, tileColor(a, colorAxis));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [artifacts, hiddenIds, colorAxis]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    const bases = basesRef.current;
    if (!mesh || !bases.length) return;
    const t = clock.elapsedTime;
    const vel = velocityRef.current;
    // Slit-scan: stretch Z proportional to camera velocity.
    const stretchZ = 1 + Math.min(Math.abs(vel) * 2.5, 2.0);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < bases.length; i++) {
      const b = bases[i];
      if (!b) continue;
      const drift = Math.sin(t * b.speed + b.phase) * 0.04;
      dummy.position.set(b.x, b.y + drift, b.z);
      dummy.lookAt(0, 0, b.z);
      dummy.scale.set(b.scale, b.scale, b.scale * stretchZ);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  useEffect(
    () => () => { geometry.dispose(); material.dispose(); },
    [geometry, material]
  );

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: WebGL primitive; keyboard access = /tunnel?mode=flat
    <instancedMesh
      ref={ref}
      args={[geometry, material, Math.max(1, artifacts.length)]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (e.instanceId != null) {
          const a = artifacts[e.instanceId];
          if (a) onSelect(a.id);
        }
      }}
    />
  );
}

// ─── Textured overlay tiles with float + slit-scan (#2 #3) ───────────────────

function TexturedTile({
  a,
  hidden,
  onSelect,
  velocityRef,
  rFn,
}: {
  a: TunnelArtifact;
  hidden: boolean;
  onSelect: (id: string) => void;
  velocityRef: React.MutableRefObject<number>;
  rFn: (y: number) => number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const t = useMemo(() => tileTransform(a, rFn), [a, rFn]);
  const phase = useMemo(() => hash01(a.id + 'tf') * Math.PI * 2, [a.id]);
  const speed = useMemo(() => 0.24 + hash01(a.id + 'tv') * 0.12, [a.id]);

  useEffect(() => {
    if (!a.thumbnailUrl) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const N = 128;
      const cv = document.createElement('canvas');
      cv.width = N; cv.height = N;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, N, N);
      const texture = new THREE.CanvasTexture(cv);
      texture.colorSpace = THREE.SRGBColorSpace;
      setTex(texture);
    };
    img.src = `/api/thumb?url=${encodeURIComponent(a.thumbnailUrl)}`;
    return () => { cancelled = true; };
  }, [a.thumbnailUrl]);

  useEffect(() => () => tex?.dispose(), [tex]);

  // Initial placement.
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    m.position.set(t.x * 0.98, t.y * 0.98, t.z);
    m.scale.setScalar(t.scale);
    m.lookAt(0, 0, t.z);
  }, [t]);

  // Animate: float (#2) + slit-scan stretch (#3).
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const drift = Math.sin(clock.elapsedTime * speed + phase) * 0.04;
    m.position.set(t.x * 0.98, t.y * 0.98 + drift, t.z);
    const vel = velocityRef.current;
    const stretchZ = 1 + Math.min(Math.abs(vel) * 2.5, 2.0);
    m.scale.set(t.scale, t.scale, t.scale * stretchZ);
    m.lookAt(0, 0, t.z);
  });

  if (!tex || hidden) return null;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: WebGL primitive; keyboard access = /tunnel?mode=flat
    <mesh ref={ref} onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(a.id); }}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}

function TexturedTiles({
  artifacts, onSelect, hiddenIds, velocityRef, rFn,
}: {
  artifacts: TunnelArtifact[];
  onSelect: (id: string) => void;
  hiddenIds: Set<string> | null;
  velocityRef: React.MutableRefObject<number>;
  rFn: (y: number) => number;
}) {
  return (
    <>
      {artifacts
        .filter((a) => a.thumbnailUrl)
        .map((a) => (
          <TexturedTile
            key={a.id}
            a={a}
            hidden={hiddenIds?.has(a.id) ?? false}
            onSelect={onSelect}
            velocityRef={velocityRef}
            rFn={rFn}
          />
        ))}
    </>
  );
}

// ─── Ambient parallax dust (#4) ───────────────────────────────────────────────

function AmbientParticles() {
  const camera = useThree((s) => s.camera);
  const ref = useRef<THREE.Points>(null);
  const { geometry } = useMemo(() => {
    const N = 180;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 0.2 + Math.random() * 0.45;
      const ang = Math.random() * Math.PI * 2;
      pos[i * 3] = r * Math.cos(ang);
      pos[i * 3 + 1] = r * Math.sin(ang);
      pos[i * 3 + 2] = (Math.random() - 0.5) * 22; // spread ±11 units
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return { geometry: g };
  }, []);
  const material = useMemo(
    () => new THREE.PointsMaterial({ color: 0xffffff, size: 0.012, transparent: true, opacity: 0.18, sizeAttenuation: true }),
    []
  );
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  // Follow camera at 60% speed for parallax (#4).
  useFrame(() => {
    const p = ref.current;
    if (!p) return;
    p.position.z += (camera.position.z - p.position.z) * 0.6;
  });
  return <points ref={ref} geometry={geometry} material={material} />;
}

// ─── Camera rig (#3 velocity + #4 ease + #16 dissolve) ───────────────────────

function CameraRig({
  onYear,
  velocityRef,
  seekRef,
  onDissolve,
}: {
  onYear: (y: number) => void;
  velocityRef: React.MutableRefObject<number>;
  seekRef: React.MutableRefObject<number | null>;
  onDissolve: () => void;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const target = useRef(-(LENGTH + 2.5));
  const auto = useRef(true);
  const lastYear = useRef(-1);
  const prevZ = useRef(camera.position.z);
  const dissolved = useRef(false);

  useEffect(() => {
    const el = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      auto.current = false;
      target.current = Math.min(5, Math.max(-(LENGTH + 3), target.current + e.deltaY * 0.02));
    };
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(e.key)) {
        auto.current = false;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          target.current = Math.min(5, target.current + 2.5);
        } else {
          target.current = Math.max(-(LENGTH + 3), target.current - 2.5);
        }
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => { el.removeEventListener('wheel', onWheel); window.removeEventListener('keydown', onKey); };
  }, [gl]);

  useFrame((_state, delta) => {
    // Consume seekRef (#8 sparkline + #13 guided mode).
    if (seekRef.current !== null) {
      target.current = seekRef.current;
      seekRef.current = null;
      auto.current = false;
    }

    if (auto.current) {
      target.current = Math.min(2, target.current + delta * 1.75);
      if (target.current > -2) auto.current = false;
    }

    camera.position.z += (target.current - camera.position.z) * 0.08;
    camera.position.x *= 0.9;
    camera.position.y *= 0.9;
    camera.lookAt(0, 0, camera.position.z + 6);

    // Track velocity for slit-scan (#3).
    velocityRef.current = camera.position.z - prevZ.current;
    prevZ.current = camera.position.z;

    // Dissolve trigger (#16): camera crosses beyond 2026 exit.
    if (camera.position.z > 3 && !dissolved.current) {
      dissolved.current = true;
      onDissolve();
    }

    const yn = Math.max(0, Math.min(1, 1 + camera.position.z / LENGTH));
    const yr = Math.round(Y0 + yn * (Y1 - Y0));
    if (yr !== lastYear.current) {
      lastYear.current = yr;
      onYear(yr);
    }
  });
  return null;
}

// ─── Dissolve effect (#16) — scatter tiles, then navigate to /live ─────────────

function DissolveTiles({
  artifacts, rFn,
}: {
  artifacts: TunnelArtifact[];
  rFn: (y: number) => number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const progress = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xb85c3b, transparent: true, opacity: 0.6 }), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    artifacts.forEach((a, i) => {
      const { x, y, z, scale } = tileTransform(a, rFn);
      dummy.position.set(x, y, z);
      dummy.lookAt(0, 0, z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [artifacts, rFn, dummy]);

  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    progress.current = Math.min(1, progress.current + delta / 3);
    const p = progress.current;
    artifacts.forEach((a, i) => {
      const { x, y, z, scale } = tileTransform(a, rFn);
      const phase = hash01(a.id + 'd');
      const scatter = p * (1 + phase);
      dummy.position.set(x * (1 + scatter), y * (1 + scatter), z);
      dummy.lookAt(0, 0, z);
      dummy.scale.setScalar(scale * (1 + p));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    material.opacity = 0.6 * (1 - p);
  });

  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <instancedMesh ref={ref} args={[geometry, material, Math.max(1, artifacts.length)]} />;
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default function TunnelScene({
  artifacts,
  stations,
  onSelect,
  onYear,
  hiddenIds,
  density,
  seekRef,
  colorAxis = 'origin',
}: {
  artifacts: TunnelArtifact[];
  stations: Station[];
  onSelect: (id: string) => void;
  onYear: (y: number) => void;
  hiddenIds: Set<string> | null;
  density: Array<{ year: number; count: number }>;
  seekRef: React.MutableRefObject<number | null>;
  colorAxis?: 'origin' | 'aiMediation' | 'authorship';
}) {
  const router = useRouter();
  const [dissolving, setDissolving] = useState(false);
  const velocityRef = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: density is stable once loaded
  const rFn = useMemo(() => buildRadiusFn(density), [density]);

  const handleDissolve = () => {
    setDissolving(true);
    // Navigate to /live after 3s dissolve.
    setTimeout(() => router.push('/live'), 3100);
  };

  return (
    <Canvas
      camera={{ position: [0, 0, -62.5], fov: 70 }}
      dpr={[1, 2]}
      style={{ position: 'absolute', inset: 0 }}
      gl={{ antialias: true, alpha: true }}
    >
      {/* #1 Depth fog — corridor fades into darkness, the past is a void */}
      <fog attach="fog" args={[0x0f0f10, 12, 58]} />

      {/* #5 Richer corridor skin */}
      <Corridor rFn={rFn} />
      <SubEraRings rFn={rFn} />
      <StationRings stations={stations} rFn={rFn} />
      {/* #7 Density glow */}
      <DensityGlow density={density} rFn={rFn} />

      {dissolving ? (
        <DissolveTiles artifacts={artifacts} rFn={rFn} />
      ) : (
        <>
          {/* #2 Float + #3 Slit-scan + #14 thesis color + #18 axis-remap */}
          <Tiles artifacts={artifacts} onSelect={onSelect} hiddenIds={hiddenIds} velocityRef={velocityRef} rFn={rFn} colorAxis={colorAxis} />
          <TexturedTiles artifacts={artifacts} onSelect={onSelect} hiddenIds={hiddenIds} velocityRef={velocityRef} rFn={rFn} />
        </>
      )}

      {/* #4 Parallax dust */}
      <AmbientParticles />

      {/* #3 velocity tracking + #8 seek + #16 dissolve trigger */}
      <CameraRig onYear={onYear} velocityRef={velocityRef} seekRef={seekRef} onDissolve={handleDissolve} />
    </Canvas>
  );
}
