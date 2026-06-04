'use client';

import type { Station, TunnelArtifact } from '@/lib/queries/tunnel';
/**
 * TunnelScene — the R3F corridor (Phase 5). Z is time (1998 at z=0 → 2026 at z=-LENGTH); the
 * cross-section radius r(z) widens through the spec's six control points, so the corridor opens out
 * as production explodes toward the present. Artifacts are instanced quads on the walls — Western on
 * the left arc, non-Western on the right — coloured by origin and scaled with r(z). Era stations are
 * highlighted rings. Scroll / arrow keys dolly the camera down the corridor; clicking a quad opens
 * its evidence panel. Quads (not textured thumbnails) keep hundreds of artifacts performant and
 * CORS-safe; thumbnail textures are a documented Stage-B refinement.
 */
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

const LENGTH = 60;
const Y0 = 1998;
const Y1 = 2026;
const CONTROL: Array<[number, number]> = [
  [1998, 1.0],
  [2005, 1.4],
  [2012, 2.0],
  [2018, 2.7],
  [2022, 3.2],
  [2026, 3.5],
];

function rOfYear(year: number): number {
  const y = Math.max(Y0, Math.min(Y1, year));
  for (let i = 0; i < CONTROL.length - 1; i++) {
    const a = CONTROL[i];
    const b = CONTROL[i + 1];
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
  // 1998 (far end, z = -LENGTH) → 2026 (near end, z = 0). The viewer flies +Z toward the present.
  return -(1 - yearNorm(year)) * LENGTH;
}
function rOfZ(z: number): number {
  return rOfYear(Y0 + (1 + z / LENGTH) * (Y1 - Y0));
}

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

function Corridor() {
  const geometry = useMemo(() => {
    const segZ = 40;
    const segR = 28;
    const pos: number[] = [];
    for (let i = 0; i <= segZ; i++) {
      const z = -(i / segZ) * LENGTH;
      const r = rOfZ(z);
      for (let j = 0; j < segR; j++) {
        const a0 = (j / segR) * Math.PI * 2;
        const a1 = ((j + 1) / segR) * Math.PI * 2;
        pos.push(r * Math.cos(a0), r * Math.sin(a0), z, r * Math.cos(a1), r * Math.sin(a1), z);
      }
    }
    const longN = 8;
    for (let j = 0; j < longN; j++) {
      const a = (j / longN) * Math.PI * 2;
      for (let i = 0; i < segZ; i++) {
        const z0 = -(i / segZ) * LENGTH;
        const z1 = -((i + 1) / segZ) * LENGTH;
        pos.push(
          rOfZ(z0) * Math.cos(a),
          rOfZ(z0) * Math.sin(a),
          z0,
          rOfZ(z1) * Math.cos(a),
          rOfZ(z1) * Math.sin(a),
          z1
        );
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, []);
  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: 0x4a4a4a, transparent: true, opacity: 0.35 }),
    []
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );
  return <lineSegments geometry={geometry} material={material} />;
}

function StationRings({ stations }: { stations: Station[] }) {
  const geometry = useMemo(() => {
    const segR = 48;
    const pos: number[] = [];
    for (const s of stations) {
      const z = -(1 - s.position) * LENGTH;
      const r = rOfZ(z) * 1.03;
      for (let j = 0; j < segR; j++) {
        const a0 = (j / segR) * Math.PI * 2;
        const a1 = ((j + 1) / segR) * Math.PI * 2;
        pos.push(r * Math.cos(a0), r * Math.sin(a0), z, r * Math.cos(a1), r * Math.sin(a1), z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [stations]);
  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: 0xb85c3b, transparent: true, opacity: 0.7 }),
    []
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );
  return <lineSegments geometry={geometry} material={material} />;
}

function Tiles({
  artifacts,
  onSelect,
}: {
  artifacts: TunnelArtifact[];
  onSelect: (id: string) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
    []
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const west = new THREE.Color(0.72, 0.36, 0.23);
    const non = new THREE.Color(0.27, 0.62, 0.56);
    const other = new THREE.Color(0.5, 0.5, 0.5);
    artifacts.forEach((a, i) => {
      const yr = a.year ?? Y1;
      const z = zOfYear(yr);
      const r = rOfYear(yr) * 0.9;
      const rnd = hash01(a.id);
      const base = a.originCode ? (isWestern(a.originCode) ? Math.PI : 0) : rnd < 0.5 ? Math.PI : 0;
      const ang = base + (rnd - 0.5) * Math.PI * 0.85;
      dummy.position.set(r * Math.cos(ang), r * Math.sin(ang), z);
      dummy.lookAt(0, 0, z);
      const sc = 0.5 + rOfYear(yr) * 0.16;
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, a.originCode ? (isWestern(a.originCode) ? west : non) : other);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [artifacts]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: <instancedMesh> is a WebGL primitive, not a DOM node — keyboard access is the /tunnel?mode=flat fallback
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

function CameraRig({ onYear }: { onYear: (y: number) => void }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const target = useRef(-(LENGTH + 2.5));
  const auto = useRef(true);
  const lastYear = useRef(-1);

  useEffect(() => {
    const el = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      auto.current = false;
      target.current = Math.min(3, Math.max(-(LENGTH + 3), target.current + e.deltaY * 0.02));
    };
    const onKey = (e: KeyboardEvent) => {
      auto.current = false;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        target.current = Math.min(3, target.current + 2.5);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        target.current = Math.max(-(LENGTH + 3), target.current - 2.5);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [gl]);

  useFrame((_state, delta) => {
    if (auto.current) {
      target.current = Math.min(2, target.current + delta * 7);
      if (target.current > -2) auto.current = false;
    }
    camera.position.z += (target.current - camera.position.z) * 0.08;
    camera.position.x *= 0.9;
    camera.position.y *= 0.9;
    camera.lookAt(0, 0, camera.position.z + 6);
    const yn = Math.max(0, Math.min(1, 1 + camera.position.z / LENGTH));
    const yr = Math.round(Y0 + yn * (Y1 - Y0));
    if (yr !== lastYear.current) {
      lastYear.current = yr;
      onYear(yr);
    }
  });
  return null;
}

export default function TunnelScene({
  artifacts,
  stations,
  onSelect,
  onYear,
}: {
  artifacts: TunnelArtifact[];
  stations: Station[];
  onSelect: (id: string) => void;
  onYear: (y: number) => void;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, -62.5], fov: 70 }}
      dpr={[1, 2]}
      style={{ position: 'absolute', inset: 0 }}
      gl={{ antialias: true, alpha: true }}
    >
      <Corridor />
      <StationRings stations={stations} />
      <Tiles artifacts={artifacts} onSelect={onSelect} />
      <CameraRig onYear={onYear} />
    </Canvas>
  );
}
