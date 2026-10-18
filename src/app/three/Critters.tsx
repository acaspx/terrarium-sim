import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { makeRng } from '../../engine/core/math.js';
import type { TerrariumState } from '../../engine/index.js';
import type { Layout, Obstacle } from './layout.js';
import { clamp, hashSeed } from './noise.js';
import { shakeOf, useMotion } from './rig.js';
import { cue } from '../sound.js';
import { critterGeometry, critterMaterials, type Body } from './critterModels.js';
import { shellTexture } from './textures.js';
import { footprint, insideFp, pointIn } from './vessel.js';

type Motion = 'hop' | 'crawl' | 'fly';

export interface Look {
  /** Half-extents of the body: width, height, length. */
  scale: [number, number, number];
  body: Body;
  color: string;
  /** Legs, antennae and underside. */
  limb: string;
  /** The face (rubber ducky) or claws (crab). */
  accent?: string;
  eye?: string;
  shell?: 'dairy-cow' | 'magic-potion';
  speed: number;
  rough: number;
  motion: Motion;
  /** Pill bugs roll into a ball when startled instead of running. */
  rolls?: boolean;
  /** Walks sideways, as crabs do: the body faces across its path. */
  sideways?: boolean;
  /** Crawlers walk and stop: seconds resting (min, max), then walking (min, max). */
  pauses?: [number, number, number, number];
  /** How many to draw for a population, and whether they hide by day. */
  count: (pop: number, lightOn: boolean) => number;
}

const big = (cap: number, perShown: number, dayShare: number) => (pop: number, lightOn: boolean) =>
  Math.round(Math.min(cap, Math.ceil(pop / perShown)) * (lightOn ? dayShare : 1));

/** What each animal looks like, and how many of a colony are out where you can see them. */
export const LOOKS: Record<string, Look> = {
  springtail: { body: 'springtail', scale: [0.0045, 0.0035, 0.009], color: '#eef0ea', limb: '#d9dcd4', speed: 0, rough: 0.5, motion: 'hop', count: (p) => Math.min(45, Math.round(Math.log10(p + 1) * 11)) },
  'dwarf-white-isopod': { body: 'isopod', scale: [0.012, 0.007, 0.02], color: '#eceee6', limb: '#d6d8cf', speed: 0.025, rough: 0.45, motion: 'crawl', count: (p) => Math.min(16, Math.ceil(Math.log2(p + 1) * 1.6)) },
  'rough-woodlouse': { body: 'isopod', scale: [0.022, 0.011, 0.036], color: '#5d6268', limb: '#45494e', speed: 0.035, rough: 0.35, motion: 'crawl', count: big(10, 2, 0.35) },
  'dairy-cow-isopod': { body: 'isopod', scale: [0.024, 0.012, 0.04], color: '#ffffff', limb: '#cfc9bd', shell: 'dairy-cow', speed: 0.05, rough: 0.35, motion: 'crawl', count: big(10, 2, 0.5) },
  'rubber-ducky-isopod': { body: 'isopod', scale: [0.016, 0.011, 0.024], color: '#5f5750', limb: '#4a433d', accent: '#f2c230', speed: 0.015, rough: 0.4, motion: 'crawl', count: big(8, 1.5, 0.5) },
  'magic-potion-isopod': { body: 'isopod', scale: [0.02, 0.013, 0.03], color: '#ffffff', limb: '#3a4152', shell: 'magic-potion', speed: 0.03, rough: 0.3, motion: 'crawl', rolls: true, count: big(10, 2, 0.5) },
  // True to size: a shell about 2 cm across, legs about 4 cm tip to tip.
  // Crabs sit still a long while, then scuttle off in a quick burst.
  'vampire-crab': { body: 'crab', scale: [0.05, 0.02, 0.038], color: '#4b2d4f', limb: '#5a2a3e', accent: '#b8344a', eye: '#f3d23c', speed: 0.11, rough: 0.35, motion: 'crawl', sideways: true, pauses: [2, 6, 0.4, 1.3], count: big(6, 1, 0.5) },
  'fungus-gnat': { body: 'gnat', scale: [0.006, 0.006, 0.009], color: '#1e1e1e', limb: '#2a2a2a', speed: 0.18, rough: 0.6, motion: 'fly', count: (p) => Math.min(12, Math.ceil(p / 12)) },
};
const FALLBACK: Look = { body: 'isopod', scale: [0.015, 0.009, 0.024], color: '#8a8a84', limb: '#6a6a64', speed: 0.03, rough: 0.4, motion: 'crawl', count: big(10, 2, 0.5) };

/** quality low: about half the animals are drawn (the colony itself is unchanged). */
export function Critters({ L, state, lively, quality = 'high', obstacles = [] }: {
  L: Layout; state: TerrariumState; lively: boolean; quality?: 'high' | 'low';
  /** Stone and water dish: start clear of them, turn away from them. */
  obstacles?: Obstacle[];
}) {
  const swarms = useMemo(
    () => state.fauna.map((f) => {
      const look = LOOKS[f.speciesId] ?? FALLBACK;
      const n = look.count(f.juveniles + f.adults, state.climate.lightOn);
      return { id: f.speciesId, look, n: quality === 'low' ? Math.ceil(n / 2) : n };
    }),
    [state.fauna, state.climate.lightOn, quality],
  );
  return <>{swarms.map((s) => <Swarm key={s.id} id={s.id} look={s.look} n={s.n} L={L} lively={lively} quality={quality} obstacles={obstacles} />)}</>;
}

interface Bug {
  x: number; z: number; y: number; h: number; t: number; vx: number; vy: number; vz: number; phase: number;
  /** Clock time until which it is running away, or rolled up. */
  flee: number;
  curl: number;
  /** Clock times: resting until `rest`, then walking until `walk`. */
  rest: number;
  walk: number;
  /** Where its legs are in their stride, and how hard it is walking (0 still, 1 walking, more running). */
  step: number;
  gait: number;
}
/** Isopods amble: short pauses, longer walks. */
const PAUSES: [number, number, number, number] = [0.6, 2.5, 1.5, 5];
/** r is the body's half-width; legs reach about twice that, so keep them clear too. */
const blocked = (obstacles: Obstacle[], x: number, z: number, r: number) => obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + r * 2);

/** How far a tap on the soil carries, in scene units. */
const STARTLE_RADIUS = 0.45;

function Swarm({ id, look, n, L, lively, quality, obstacles }: {
  id: string; look: Look; n: number; L: Layout; lively: boolean; quality: 'high' | 'low'; obstacles: Obstacle[];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // The shared body plus this colony's own gait per animal. The body's buffers are shared,
  // so this wrapper is never disposed (that would free them for every other colony too).
  const geometry = useMemo(() => {
    const base = critterGeometry(look.body, quality);
    const g = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(base.attributes)) g.setAttribute(name, attr);
    g.groups = base.groups.map((gr) => ({ ...gr }));
    g.setAttribute('gait', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 4), 4));
    return g;
  }, [look.body, quality, n]);
  const mats = useMemo(() => critterMaterials({ shell: look.color, limb: look.limb, accent: look.accent, eye: look.eye, rough: look.rough, map: look.shell ? shellTexture(look.shell) : null, sideways: look.sideways }), [look]);
  const bugs = useMemo<Bug[]>(() => {
    const r = makeRng(hashSeed(id) + n);
    return Array.from({ length: n }, () => {
      // A few tries for a spot that is not under the stone or in the dish.
      let [x, z] = pointIn(L.groundFp, r() * 2 - 1, r() * 2 - 1);
      for (let k = 0; k < 12 && blocked(obstacles, x, z, look.scale[0]); k++) [x, z] = pointIn(L.groundFp, r() * 2 - 1, r() * 2 - 1);
      const a = r() * Math.PI * 2;
      return { x, z, y: L.gy + 0.2 + r() * 0.6, h: a, t: r() * 4, vx: Math.cos(a) * 0.1, vy: 0, vz: Math.sin(a) * 0.1, phase: r() * 10, flee: 0, curl: 0, rest: 0, walk: r() * 3, step: r() * 6, gait: 0 };
    });
  }, [id, n, L, obstacles]);
  const tmp = useMemo(() => ({
    m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(),
    s: new THREE.Vector3(...look.scale),
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
    let ran: Bug | null = null;
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
        ran = b;
      } else {
        // Gnats lift off.
        b.vy += 0.15;
      }
    }
    // Crabs are big enough to hear running off.
    if (ran && look.sideways) cue('scuttle', clamp(ran.x / 1.5, -0.8, 0.8));
  };

  const write = (dt: number) => {
    const mesh = ref.current;
    if (!mesh) return;
    const fp = L.groundFp;
    if (dt > 0) startle();
    const now = motion.clock;
    const gaits = geometry.attributes.gait as THREE.InstancedBufferAttribute;
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
          if (insideFp(fp, nx, nz) && !blocked(obstacles, nx, nz, look.scale[0])) { b.x = nx; b.z = nz; }
        }
        y = L.ground.heightAt(b.x, b.z) + 0.005 + hop;
      } else if (b.curl > now) {
        // Rolled into a ball: still, round, waiting it out.
        y = L.ground.heightAt(b.x, b.z) + ball.y * 0.9;
        scale = ball;
      } else {
        // Crawlers walk a while, stop a while, turning gently and turning back at the glass.
        // Startled, they run (crabs a short way, claws up).
        const fleeing = b.flee > now;
        if (!fleeing && now >= b.walk) {
          const [r0, r1, w0, w1] = look.pauses ?? PAUSES;
          b.rest = now + r0 + Math.random() * (r1 - r0);
          b.walk = b.rest + w0 + Math.random() * (w1 - w0);
        }
        const speed = fleeing ? look.speed * (look.sideways ? 2 : 4) : now < b.rest ? 0 : look.speed;
        if (speed > 0) {
          b.h += Math.sin(b.phase + performance.now() / 1700) * dt * (fleeing ? 0.3 : 1.2);
          const nx = b.x + Math.sin(b.h) * speed * dt;
          const nz = b.z + Math.cos(b.h) * speed * dt;
          if (insideFp(fp, nx, nz, 0.02) && !blocked(obstacles, nx, nz, look.scale[0])) { b.x = nx; b.z = nz; } else b.h += Math.PI * 0.7;
        }
        // Legs ease in and out of their stride: a full step cycle every half body length.
        b.gait += (speed / look.speed - b.gait) * Math.min(1, dt * 8);
        b.step += (dt * speed * Math.PI * 2) / look.scale[2];
        y = L.ground.heightAt(b.x, b.z) + look.scale[1] * (0.7 + 0.06 * Math.abs(Math.sin(b.step)) * Math.min(1, b.gait));
      }
      // Crabs face across their path; the front is where the eyes and claws go.
      const face = look.sideways ? b.h + Math.PI / 2 : b.h;
      tmp.e.set(0, face, 0);
      tmp.q.setFromEuler(tmp.e);
      tmp.p.set(b.x, y, b.z);
      tmp.m.compose(tmp.p, tmp.q, scale);
      mesh.setMatrixAt(i, tmp.m);
      // Rolled up, legs still; gnats flap all the time; crabs threaten while they flee.
      const moving = scale === ball ? 0 : look.motion === 'fly' ? 1 : b.gait;
      gaits.setXYZW(i, b.step, Math.min(1.6, moving), look.sideways && b.flee > now ? Math.min(1, b.flee - now) : 0, now);
    }
    mesh.instanceMatrix.needsUpdate = true;
    gaits.needsUpdate = true;
  };

  useLayoutEffect(() => write(0));
  useFrame((_, dt) => {
    // Startled animals move even when the jar is otherwise still.
    if (lively || motion.disturbances.some((d) => d.t > seen.current)) write(Math.min(dt, 0.05));
  });
  if (n === 0) return null;
  return (
    <>
      <instancedMesh key={n} ref={ref} args={[geometry, mats, n]} castShadow frustumCulled={false} userData={{ critter: id }} />
    </>
  );
}
