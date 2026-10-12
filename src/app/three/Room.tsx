import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlacementId } from '../../engine/index.js';
import { fittoniaTexture } from './textures.js';

const SKY: Partial<Record<PlacementId, string>> = {
  'north-window': '#cfe0f0',
  'east-window': '#f7e6c8',
  'south-window': '#fff1cc',
};
const NIGHT_SKY = new THREE.Color('#152036');

let gradient: THREE.CanvasTexture | null = null;
function skyGradient() {
  if (!gradient) {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#b9bec4');
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 128);
    gradient = new THREE.CanvasTexture(c);
    gradient.colorSpace = THREE.SRGBColorSpace;
  }
  return gradient;
}

/**
 * The room around the jar, showing where it sits: a window (north, east or south)
 * whose sky follows the jar's day and night, a grow light hung above it, or a
 * dim corner with a picture on the wall. It is the placement choice made visible.
 */
export function Room({ placement, lightOn, wall, top, baseY }: { placement: PlacementId; lightOn: boolean; wall: string; top: number; baseY: number }) {
  const dim = placement === 'dim-corner';
  const wallMat = useMemo(() => {
    const c = new THREE.Color(wall);
    // The walls are lit by the room, not just by the jar's own light: a little self-light keeps them from going grey.
    return new THREE.MeshStandardMaterial({ color: c, roughness: 1, side: THREE.BackSide, emissive: c, emissiveIntensity: 0 });
  }, [wall]);
  // three only compiles what is visible, so show every fixture for one compile pass, then restore.
  const fixtures = useRef<THREE.Group>(null);
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const groups = fixtures.current?.children ?? [];
    const shown = groups.map((g) => g.visible);
    groups.forEach((g) => (g.visible = true));
    gl.compile(scene, camera);
    groups.forEach((g, i) => (g.visible = shown[i]!));
    // Only once per view: later placement changes reuse what was compiled here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);
  useFrame((_, dt) => {
    const target = lightOn ? (dim ? 0.18 : 0.42) : 0.04;
    wallMat.emissiveIntensity += (target - wallMat.emissiveIntensity) * (1 - Math.exp(-dt * 3));
  });
  return (
    <group>
      <mesh position={[0, baseY + 3.5, 0]} material={wallMat}>
        <boxGeometry args={[14, 10, 14]} />
      </mesh>
      {/* Every fixture is built up front and only shown for its placement, so changing placement
          never compiles new materials at the moment of the click. */}
      <group ref={fixtures}>
        <group visible={!!SKY[placement]}><Window color={SKY[placement] ?? SKY['north-window']!} lightOn={lightOn} baseY={baseY} /></group>
        <group visible={placement === 'grow-light'}><GrowLight lightOn={lightOn} y={top + 0.6} /></group>
        <group visible={placement === 'dim-corner'}><Print baseY={baseY} /></group>
      </group>
    </group>
  );
}

function Window({ color, lightOn, baseY }: { color: string; lightOn: boolean; baseY: number }) {
  const sky = useRef<THREE.MeshBasicMaterial>(null);
  const day = useMemo(() => new THREE.Color(color), [color]);
  useFrame((_, dt) => {
    if (sky.current) sky.current.color.lerp(lightOn ? day : NIGHT_SKY, 1 - Math.exp(-dt * 3));
  });
  const frame = '#efece5';
  const w = 2.4;
  const h = 3;
  const t = 0.12;
  return (
    <group position={[-1.8, baseY + 2.3, -6.97]}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial ref={sky} map={skyGradient()} color={color} toneMapped={false} />
      </mesh>
      {[
        [0, h / 2, w + t, t], [0, -h / 2, w + t, t], [-w / 2, 0, t, h], [w / 2, 0, t, h], [0, 0, t * 0.5, h], [0, 0.25, w, t * 0.5],
      ].map(([x, y, bw, bh], i) => (
        <mesh key={i} position={[x!, y!, 0.04]}>
          <boxGeometry args={[bw!, bh!, 0.1]} />
          <meshStandardMaterial color={frame} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, -h / 2 - 0.06, 0.18]}>
        <boxGeometry args={[w + 0.5, 0.08, 0.36]} />
        <meshStandardMaterial color={frame} roughness={0.6} />
      </mesh>
    </group>
  );
}

function GrowLight({ lightOn, y }: { lightOn: boolean; y: number }) {
  const strip = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((_, dt) => {
    if (strip.current) strip.current.emissiveIntensity += ((lightOn ? 3 : 0) - strip.current.emissiveIntensity) * (1 - Math.exp(-dt * 4));
  });
  return (
    <group position={[0, y, 0]}>
      <mesh>
        <boxGeometry args={[2.6, 0.06, 0.32]} />
        <meshStandardMaterial color="#2b2f2c" roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[0, -0.032, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.4, 0.22]} />
        <meshStandardMaterial ref={strip} color="#ffffff" emissive="#fff3fa" emissiveIntensity={3} />
      </mesh>
      {[-1.1, 1.1].map((x) => (
        <mesh key={x} position={[x, 2, 0]}>
          <cylinderGeometry args={[0.006, 0.006, 4, 6]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      ))}
    </group>
  );
}

function Print({ baseY }: { baseY: number }) {
  return (
    <group position={[1.9, baseY + 2.4, -6.96]}>
      <mesh>
        <boxGeometry args={[1.0, 1.3, 0.05]} />
        <meshStandardMaterial color="#3a2e24" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[0.8, 1.1]} />
        <meshStandardMaterial map={fittoniaTexture()} roughness={0.9} />
      </mesh>
    </group>
  );
}
