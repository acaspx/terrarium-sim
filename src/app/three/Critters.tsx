import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { makeRng } from '../../engine/core/math.js';
import type { TerrariumState } from '../../engine/index.js';
import type { Layout } from './layout.js';
import { clamp, hashSeed } from './noise.js';
import { shakeOf, useMotion } from './rig.js';
import { shellTexture } from './textures.js';
import { footprint, insideFp, pointIn } from './vessel.js';

type Motion = 'hop' | 'crawl' | 'fly';

export interface Look {
  /** Half-extents of the body: width, height, length. */
  scale: [number, number, number];
  color: string;
  shell?: 'dairy-cow' | 'magic-potion';
  /** A differently coloured head, for the rubber ducky's yellow face. */
  head?: { color: string; scale: [number, number, number] };
  speed: number;
  rough: number;
  motion: Motion;
  /** Pill bugs roll into a ball when startled instead of running. */
  rolls?: boolean;
  /** A pair of claws at the front, for crabs. */
  claws?: { color: string; scale: [number, number, number] };
  /** Walks sideways, as crabs do: the body faces across its path. */
  sideways?: boolean;
  /** How many to draw for a population, and whether they hide by day. */
  count: (pop: number, lightOn: boolean) => number;
}

const big = (cap: number, perShown: number, dayShare: number) => (pop: number, lightOn: boolean) =>
  Math.round(Math.min(cap, Math.ceil(pop / perShown)) * (lightOn ? dayShare : 1));

/** What each animal looks like, and how many of a colony are out where you can see them. */
export const LOOKS: Record<string, Look> = {
  springtail: { scale: [0.0045, 0.0035, 0.009], color: '#eef0ea', speed: 0, rough: 0.5, motion: 'hop', count: (p) => Math.min(45, Math.round(Math.log10(p + 1) * 11)) },
  'dwarf-white-isopod': { scale: [0.012, 0.007, 0.02], color: '#eceee6', speed: 0.025, rough: 0.45, motion: 'crawl', count: (p) => Math.min(16, Math.ceil(Math.log2(p + 1) * 1.6)) },
  'rough-woodlouse': { scale: [0.022, 0.011, 0.036], color: '#5d6268', speed: 0.035, rough: 0.35, motion: 'crawl', count: big(10, 2, 0.35) },
  'dairy-cow-isopod': { scale: [0.024, 0.012, 0.04], color: '#ffffff', shell: 'dairy-cow', speed: 0.05, rough: 0.35, motion: 'crawl', count: big(10, 2, 0.5) },
  'rubber-ducky-isopod': { scale: [0.016, 0.011, 0.024], color: '#5f5750', head: { color: '#f2c230', scale: [0.011, 0.008, 0.008] }, speed: 0.015, rough: 0.4, motion: 'crawl', count: big(8, 1.5, 0.5) },
  'magic-potion-isopod': { scale: [0.02, 0.013, 0.03], color: '#ffffff', shell: 'magic-potion', speed: 0.03, rough: 0.3, motion: 'crawl', rolls: true, count: big(10, 2, 0.5) },
  'vampire-crab': {
    scale: [0.04, 0.016, 0.03], color: '#4b2d4f', head: { color: '#f3d23c', scale: [0.016, 0.006, 0.005] },
    claws: { color: '#b8344a', scale: [0.011, 0.009, 0.016] }, speed: 0.04, rough: 0.35, motion: 'crawl', sideways: true, count: big(6, 1, 0.5),
  },
  'fungus-gnat': { scale: [0.006, 0.006, 0.009], color: '#1e1e1e', speed: 0.18, rough: 0.6, motion: 'fly', count: (p) => Math.min(12, Math.ceil(p / 12)) },
};
const FALLBACK: Look = { scale: [0.015, 0.009, 0.024], color: '#8a8a84', speed: 0.03, rough: 0.4, motion: 'crawl', count: big(10, 2, 0.5) };

/** quality low: about half the animals are drawn (the colony itself is unchanged). */
export function Critters({ L, state, lively, quality = 'high' }: { L: Layout; state: TerrariumState; lively: boolean; quality?: 'high' | 'low' }) {
  const swarms = useMemo(
    () => state.fauna.map((f) => {
      const look = LOOKS[f.speciesId] ?? FALLBACK;
      const n = look.count(f.juveniles + f.adults, state.climate.lightOn);
      return { id: f.speciesId, look, n: quality === 'low' ? Math.ceil(n / 2) : n };
    }),
    [state.fauna, state.climate.lightOn, quality],
  );
  return <>{swarms.map((s) => <Swarm key={s.id} id={s.id} look={s.look} n={s.n} L={L} lively={lively} />)}</>;
}

interface Bug {
  x: number; z: number; y: number; h: number; t: number; vx: number; vy: number; vz: number; phase: number;
  /** Clock time until which it is running away, or rolled up. */
  flee: number;
  curl: number;
}
/** How far a tap on the soil carries, in scene units. */
const STARTLE_RADIUS = 0.45;
const BODY = new THREE.SphereGeometry(1, 12, 8);

function Swarm({ id, look, n, L, lively }: { id: string; look: Look; n: number; L: Layout; lively: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const claws = useRef<THREE.InstancedMesh>(null);
  const clawMat = useMemo(() => (look.claws ? new THREE.MeshStandardMaterial({ color: look.claws.color, roughness: 0.4 }) : null), [look]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: look.color, roughness: look.rough, map: look.shell ? shellTexture(look.shell) : null }), [look]);
  const headMat = useMemo(() => (look.head ? new THREE.MeshStandardMaterial({ color: look.head.color, roughness: 0.4 }) : null), [look]);
  const bugs = useMemo<Bug[]>(() => {
    const r = makeRng(hashSeed(id) + n);
    return Array.from({ length: n }, () => {
      const [x, z] = pointIn(L.groundFp, r() * 2 - 1, r() * 2 - 1);
      const a = r() * Math.PI * 2;
      return { x, z, y: L.gy + 0.2 + r() * 0.6, h: a, t: r() * 4, vx: Math.cos(a) * 0.1, vy: 0, vz: Math.sin(a) * 0.1, phase: r() * 10, flee: 0, curl: 0 };
    });
  }, [id, n, L]);
  const tmp = useMemo(() => ({
    m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(),
    s: new THREE.Vector3(...look.scale), hs: new THREE.Vector3(...(look.head?.scale ?? [0, 0, 0])),
    cs: new THREE.Vector3(...(look.claws?.scale ?? [0, 0, 0])),
  }), [look]);

  const motion = useMotion();
  const seen = useRef(0);
  const ball = useMemo(() => new THREE.Vector3(look.scale[0] * 1.1, look.scale[0] * 1.1, look.scale[0] * 1.1), [look]);

  /** Taps on the soil since last frame, and a hard shake, startle the animals nearby. */
  const startle = () => {
    const now = motion.clock;
    const fresh = motion.disturbances.filter((d) => d.t > seen.current);
    seen.current = now;
    const shaken = shakeOf(motion) > 0.8;
    if (!fresh.length && !shaken) return;
    for (const b of bugs) {
      const near = fresh.find((d) => Math.hypot(b.x - d.x, b.z - d.z) < STARTLE_RADIUS);
      if (!near && !shaken) continue;
      if (look.motion === 'hop') {
        b.t = -0.001; // hop now
        if (near) b.h = Math.atan2(b.x - near.x, b.z - near.z);
      } else if (look.rolls) {
        b.curl = now + 3 + Math.random() * 2;
      } else if (look.motion === 'crawl') {
        b.flee = now + 1.5 + Math.random();
        if (near) b.h = Math.atan2(b.x - near.x, b.z - near.z);
      } else {
        // Gnats lift off.
        b.vy += 0.15;
      }
    }
  };

  const write = (dt: number) => {
    const mesh = ref.current;
    if (!mesh) return;
    const fp = L.groundFp;
    if (dt > 0) startle();
    const now = motion.clock;
    for (let i = 0; i < bugs.length; i++) {
      const b = bugs[i]!;
      let y: number;
      let scale = tmp.s;
      if (look.motion === 'fly') {
        b.vx += (Math.random() - 0.5) * dt * 1.4;
        b.vy += (Math.random() - 0.5) * dt * 1.0;
        b.vz += (Math.random() - 0.5) * dt * 1.4;
        const sp = Math.hypot(b.vx, b.vy, b.vz);
        if (sp > look.speed) { b.vx *= look.speed / sp; b.vy *= look.speed / sp; b.vz *= look.speed / sp; }
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        const lo = L.gy + 0.12;
        const hi = (L.shape.kind === 'square' ? L.shape.wallTop : L.shape.top) - 0.3;
        if (b.y < lo || b.y > hi) { b.vy = -b.vy; b.y = clamp(b.y, lo, hi); }
        if (!insideFp(footprint(L.shape, b.y, 0.08), b.x, b.z)) { b.vx = -b.vx - b.x * 0.2; b.vz = -b.vz - b.z * 0.2; b.x *= 0.98; b.z *= 0.98; }
        y = b.y;
        b.h = Math.atan2(b.vx, b.vz);
      } else if (look.motion === 'hop') {
        // Mostly still, then a sudden hop.
        b.t -= dt;
        if (b.t < -0.35) {
          b.t = 1.5 + Math.random() * 5;
          b.h = Math.random() * Math.PI * 2;
        }
        let hop = 0;
        if (b.t < 0) {
          const u = -b.t / 0.35;
          hop = 4 * u * (1 - u) * 0.06;
          const nx = b.x + Math.sin(b.h) * dt * 0.18;
          const nz = b.z + Math.cos(b.h) * dt * 0.18;
          if (insideFp(fp, nx, nz)) { b.x = nx; b.z = nz; }
        }
        y = L.ground.heightAt(b.x, b.z) + 0.005 + hop;
      } else if (b.curl > now) {
        // Rolled into a ball: still, round, waiting it out.
        y = L.ground.heightAt(b.x, b.z) + ball.y * 0.9;
        scale = ball;
      } else {
        // Crawlers wander, turning gently, and turn back at the glass. Startled, they run.
        const speed = look.speed * (b.flee > now ? 4 : 1);
        b.h += Math.sin(b.phase + performance.now() / 1700) * dt * (b.flee > now ? 0.3 : 1.2);
        const nx = b.x + Math.sin(b.h) * speed * dt;
        const nz = b.z + Math.cos(b.h) * speed * dt;
        if (insideFp(fp, nx, nz, 0.02)) { b.x = nx; b.z = nz; } else b.h += Math.PI * 0.7;
        y = L.ground.heightAt(b.x, b.z) + look.scale[1] * 0.7;
      }
      // Crabs face across their path; the front is where the eyes and claws go.
      const face = look.sideways ? b.h + Math.PI / 2 : b.h;
      tmp.e.set(0, face, 0);
      tmp.q.setFromEuler(tmp.e);
      tmp.p.set(b.x, y, b.z);
      tmp.m.compose(tmp.p, tmp.q, scale);
      mesh.setMatrixAt(i, tmp.m);
      if (heads.current) {
        if (scale === ball) tmp.hs.setScalar(0);
        else tmp.hs.set(...(look.head?.scale ?? [0, 0, 0]));
        const up = look.claws ? look.scale[1] * 0.8 : 0;
        tmp.p.set(b.x + Math.sin(face) * look.scale[2] * 0.85, y + up, b.z + Math.cos(face) * look.scale[2] * 0.85);
        tmp.m.compose(tmp.p, tmp.q, tmp.hs);
        heads.current.setMatrixAt(i, tmp.m);
      }
      if (claws.current) {
        // Left and right of the front, held a little forward.
        for (const side of [-1, 1]) {
          const fx = Math.sin(face) * look.scale[2] * 1.05;
          const fz = Math.cos(face) * look.scale[2] * 1.05;
          const sx = Math.cos(face) * look.scale[0] * 0.8 * side;
          const sz = -Math.sin(face) * look.scale[0] * 0.8 * side;
          tmp.p.set(b.x + fx + sx, y, b.z + fz + sz);
          tmp.m.compose(tmp.p, tmp.q, tmp.cs);
          claws.current.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), tmp.m);
        }
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (heads.current) heads.current.instanceMatrix.needsUpdate = true;
    if (claws.current) claws.current.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => write(0));
  useFrame((_, dt) => {
    // Startled animals move even when the jar is otherwise still.
    if (lively || motion.disturbances.some((d) => d.t > seen.current)) write(Math.min(dt, 0.05));
  });
  if (n === 0) return null;
  return (
    <>
      <instancedMesh key={n} ref={ref} args={[BODY, mat, n]} castShadow frustumCulled={false} />
      {headMat && <instancedMesh key={`h${n}`} ref={heads} args={[BODY, headMat, n]} frustumCulled={false} />}
      {clawMat && <instancedMesh key={`c${n}`} ref={claws} args={[BODY, clawMat, n * 2]} castShadow frustumCulled={false} />}
    </>
  );
}
