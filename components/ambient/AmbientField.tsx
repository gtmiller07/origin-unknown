'use client';

import type { Particle } from '@/lib/queries/ambient';
/**
 * AmbientField — the interactive R3F particle field (Phase 6). Each scored artifact is one point:
 * position clusters by origin region, colour temperature runs cool→warm by aesthetic_signal, point
 * size by reach, glow (additive) by the diplomatic-effect composite. OrbitControls (from three's
 * examples, so drei stays out of the React-19 path) give drag-rotate + scroll-zoom; the field
 * auto-drifts at rest until the viewer grabs it. Hovering a point reports its index + screen
 * position (for the scorecard); clicking opens the evidence panel. A custom point shader carries
 * per-point size + glow, which PointsMaterial cannot.
 */
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const REGION_CENTERS: Record<string, number[]> = {
  na: [-4.5, 1.5, 0.5],
  weu: [-1.5, 3, -2],
  lat: [-3.5, -2.5, 1.5],
  eas: [4, 1, -1.5],
  sas: [2, -1.5, 2],
  mea: [0.5, -3, -2.5],
  other: [0, 0.5, 0],
};
const COUNTRY_REGION: Record<string, string> = {
  US: 'na',
  CA: 'na',
  GB: 'weu',
  DE: 'weu',
  FR: 'weu',
  ES: 'weu',
  IT: 'weu',
  NL: 'weu',
  SE: 'weu',
  IE: 'weu',
  PT: 'weu',
  BE: 'weu',
  CH: 'weu',
  AT: 'weu',
  NO: 'weu',
  DK: 'weu',
  FI: 'weu',
  BR: 'lat',
  MX: 'lat',
  VE: 'lat',
  CO: 'lat',
  AR: 'lat',
  CL: 'lat',
  PE: 'lat',
  CN: 'eas',
  JP: 'eas',
  KR: 'eas',
  TW: 'eas',
  HK: 'eas',
  IN: 'sas',
  ID: 'sas',
  SG: 'sas',
  PH: 'sas',
  TH: 'sas',
  VN: 'sas',
  MY: 'sas',
  PK: 'sas',
  EG: 'mea',
  SA: 'mea',
  AE: 'mea',
  NG: 'mea',
  ZA: 'mea',
  CG: 'mea',
  TR: 'mea',
  IR: 'mea',
  KE: 'mea',
};
function regionOf(code: string | null): string {
  return code ? (COUNTRY_REGION[code] ?? 'other') : 'other';
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function aestheticColor(v: number): number[] {
  const cool = [0.29, 0.42, 0.48];
  const mid = [0.72, 0.36, 0.23];
  const warm = [0.94, 0.9, 0.82];
  const t = Math.max(0, Math.min(1, v));
  const lerp = (a: number[], b: number[], u: number): number[] => [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
  ];
  return t < 0.5 ? lerp(cool, mid, t * 2) : lerp(mid, warm, (t - 0.5) * 2);
}
function diplomaticGlow(p: Particle): number {
  const v = [
    p.axes.diplomatic_cross_boundary,
    p.axes.diplomatic_authenticity,
    p.axes.diplomatic_reciprocity,
  ].filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0.05;
}

const vertexShader = `
attribute vec3 color;
attribute float size;
attribute float glow;
varying vec3 vColor;
varying float vGlow;
void main() {
  vColor = color;
  vGlow = glow;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (9.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const fragmentShader = `
varying vec3 vColor;
varying float vGlow;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float falloff = smoothstep(0.5, 0.0, d);
  float alpha = falloff * (0.4 + 0.6 * vGlow);
  gl_FragColor = vec4(vColor * (0.85 + 0.45 * vGlow), alpha);
}`;

function Controls({ reducedMotion }: { reducedMotion: boolean }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);
  useEffect(() => {
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 22;
    controls.autoRotate = !reducedMotion;
    controls.autoRotateSpeed = 0.45;
    const stop = () => {
      controls.autoRotate = false;
    };
    controls.addEventListener('start', stop);
    return () => {
      controls.removeEventListener('start', stop);
      controls.dispose();
    };
  }, [controls, reducedMotion]);
  useFrame(() => controls.update());
  return null;
}

function RaycastTune() {
  const raycaster = useThree((s) => s.raycaster);
  useEffect(() => {
    raycaster.params.Points = { threshold: 0.4 };
  }, [raycaster]);
  return null;
}

function Field({
  particles,
  onHover,
  onSelect,
}: {
  particles: Particle[];
  onHover: (index: number | null, x: number, y: number) => void;
  onSelect: (id: string) => void;
}) {
  const geometry = useMemo(() => {
    const n = particles.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const glows = new Float32Array(n);
    particles.forEach((p, i) => {
      const rng = mulberry32(hash(p.id));
      const center = REGION_CENTERS[regionOf(p.originCode)] ?? [0, 0.5, 0];
      const spread = 1.7;
      positions[i * 3] = center[0] + (rng() - 0.5) * spread * 2;
      positions[i * 3 + 1] = center[1] + (rng() - 0.5) * spread * 2;
      positions[i * 3 + 2] = center[2] + (rng() - 0.5) * spread * 2;
      const col = aestheticColor(p.axes.aesthetic_signal ?? 0.3);
      colors[i * 3] = col[0];
      colors[i * 3 + 1] = col[1];
      colors[i * 3 + 2] = col[2];
      sizes[i] = 5 + (p.axes.reach ?? 0.1) * 24;
      glows[i] = diplomaticGlow(p);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    g.setAttribute('glow', new THREE.BufferAttribute(glows, 1));
    return g;
  }, [particles]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: <points> is a WebGL primitive, not a DOM node — keyboard access is provided by the /live?view=list fallback
    <points
      geometry={geometry}
      material={material}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (e.index != null) onHover(e.index, e.nativeEvent.clientX, e.nativeEvent.clientY);
      }}
      onPointerOut={() => onHover(null, 0, 0)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (e.index != null) {
          const p = particles[e.index];
          if (p) onSelect(p.id);
        }
      }}
    />
  );
}

export default function AmbientField({
  particles,
  reducedMotion = false,
  onHover,
  onSelect,
}: {
  particles: Particle[];
  reducedMotion?: boolean;
  onHover: (index: number | null, x: number, y: number) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 9], fov: 60 }}
      dpr={[1, 2]}
      style={{ position: 'absolute', inset: 0 }}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={() => onHover(null, 0, 0)}
    >
      <Controls reducedMotion={reducedMotion} />
      <RaycastTune />
      <Field particles={particles} onHover={onHover} onSelect={onSelect} />
    </Canvas>
  );
}
