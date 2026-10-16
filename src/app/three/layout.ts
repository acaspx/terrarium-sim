import { useMemo } from 'react';
import * as THREE from 'three';
import { layoutOf, type TerrariumSpec } from '../../engine/index.js';
import { clamp } from './noise.js';
import { footprint, groundGeometry, insideFp, pointIn, SHAPES, type Footprint, type Shape } from './vessel.js';

const DRAIN_H = { none: 0, leca: 0.2, gravel: 0.16 } as const;
const SUB_H = { shallow: 0.24, standard: 0.36, deep: 0.48 } as const;
const BASE_H: Partial<Record<string, number>> = { cloche: 0.12, wardian: 0.14 };

/** Where everything sits inside one vessel, in scene units. */
export interface Layout {
  shape: Shape;
  floorY: number;
  drainTop: number;
  /** Height of the soil surface (before its lumps). */
  gy: number;
  baseY: number;
  groundFp: Footprint;
  ground: ReturnType<typeof groundGeometry>;
  /** Plants in a small vessel are drawn larger, as on the shelf. */
  k: number;
}

/** Where everything sits, worked out from the design (no React; see useLayout). */
export function layoutFor(spec: Pick<TerrariumSpec, 'vessel' | 'drainage' | 'depth' | 'seed' | 'sizeL'>): Layout {
  const shape = SHAPES[spec.vessel];
  const floorY = shape.kind === 'round' && shape.openBottom ? 0 : 0.03;
  const drainTop = floorY + DRAIN_H[spec.drainage];
  const gy = drainTop + SUB_H[spec.depth];
  const ground = groundGeometry(shape, gy, spec.seed, 0.018);
  return {
    shape, floorY, drainTop, gy, ground,
    baseY: -(BASE_H[spec.vessel] ?? 0.002),
    groundFp: footprint(shape, gy, 0.1),
    k: clamp(3.5 * Math.cbrt(6 / spec.sizeL), 2.1, 4.8),
  };
}

export function useLayout(spec: TerrariumSpec): Layout {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => layoutFor(spec), [spec.vessel, spec.drainage, spec.depth, spec.seed, spec.sizeL]);
}

/** Round to a step, so the scene rebuilds geometry only when a change would be visible. */
export const q = (x: number, step: number) => Math.round(x / step) * step;

/** Inverse of pointIn: scene x, z on the floor to layout u, v, held inside the planting area. */
export function toUv(fp: Footprint, x: number, z: number): [number, number] {
  if (fp.kind === 'rect') return [clamp(x / fp.hx, -0.95, 0.95), clamp(z / fp.hz, -0.95, 0.95)];
  let u = x / fp.r;
  let v = z / fp.r;
  const d = Math.hypot(u, v);
  if (d > 0.88) {
    u *= 0.88 / d;
    v *= 0.88 / d;
  }
  return [u, v];
}

/** Where the wood or stone was moved to: u, v on the floor as for plants, and how far the wood is turned. */
export interface Placed {
  at: [number, number];
  turn?: number;
}

/** The driftwood: a log from the left rising toward the back right, with one branch. Mushrooms grow on it. */
function defaultWood(L: Layout) {
  const { gy, groundFp, shape } = L;
  const R = groundFp.kind === 'circle' ? groundFp.r : Math.min(groundFp.hx, groundFp.hz) * 1.1;
  const lift = Math.min(0.55, (shape.top - gy) * 0.45);
  const a = new THREE.Vector3(-0.78 * R, gy - 0.03, -0.1 * R);
  const b = new THREE.Vector3(-0.25 * R, gy + lift * 0.45, -0.42 * R);
  const c = new THREE.Vector3(0.5 * R, gy + lift, -0.5 * R);
  return {
    trunk: [a, new THREE.Vector3(-0.55 * R, gy + 0.08, -0.25 * R), b, c],
    branch: [b, new THREE.Vector3(-0.05 * R, gy + lift * 0.6, -0.25 * R), new THREE.Vector3(0.12 * R, gy + lift * 0.7, -0.1 * R)],
    r0: 0.1 * Math.min(1, R),
    r1: 0.03,
  };
}

/** The middle of the log seen from above: what is dragged, and what it turns about. */
function middle(points: THREE.Vector3[]) {
  const m = new THREE.Vector3();
  for (const p of points) m.add(p);
  return m.divideScalar(points.length).setY(0);
}

/** Where the log sits before anyone moves it, as floor u, v. */
export function woodHome(L: Layout): [number, number] {
  const m = middle(defaultWood(L).trunk);
  return toUv(L.groundFp, m.x, m.z);
}

/**
 * The driftwood, moved and turned as the keeper arranged it. A spot that would push it
 * through the glass is pulled in toward the middle of the jar until it fits.
 */
export function woodPath(L: Layout, placed?: Placed) {
  const w = defaultWood(L);
  if (!placed) return w;
  const mid = middle(w.trunk);
  const [tx, tz] = pointIn(L.groundFp, ...placed.at);
  const turn = placed.turn ?? 0;
  const at = (k: number) => {
    const dx = tx * k - mid.x;
    const dz = tz * k - mid.z;
    const m = (p: THREE.Vector3) => p.clone().sub(mid).applyAxisAngle(UP, turn).add(mid).add(new THREE.Vector3(dx, 0, dz));
    return { ...w, trunk: w.trunk.map(m), branch: w.branch.map(m) };
  };
  const fits = (c: ReturnType<typeof at>) =>
    [...c.trunk, ...c.branch].every((p) => insideFp(footprint(L.shape, Math.max(p.y, L.gy), 0), p.x, p.z, w.r0 + 0.03));
  for (let k = 1; k > 0.05; k -= 0.1) {
    const c = at(k);
    if (fits(c)) return c;
  }
  return at(0);
}

const UP = new THREE.Vector3(0, 1, 0);

/** About how far the floor reaches from the middle, in scene units. */
export const floorRadius = (L: Layout) => (L.groundFp.kind === 'circle' ? L.groundFp.r : Math.min(L.groundFp.hx, L.groundFp.hz) * 1.1);

/** The stone's scale; its outline reaches about 1.45 times this from its middle. */
export const stoneSize = (L: Layout) => 0.24 * Math.min(1, floorRadius(L));

/** The crabs' water dish: front left, sunk to its rim. */
export function dishSpot(L: Layout) {
  return { at: pointIn(L.groundFp, -0.5, 0.42), r: 0.15 * Math.min(1, floorRadius(L)) };
}

const hasCrabs = (spec: TerrariumSpec) => spec.fauna.some((f) => f.speciesId === 'vampire-crab' && f.count > 0);

/** The log and the dish: the stone must not overlap these. (Plants it may nestle against.) */
function solid(L: Layout, spec: TerrariumSpec) {
  const out: { at: [number, number]; r: number }[] = [];
  if (spec.hardscape.includes('wood')) {
    const w = woodPath(L, spec.placed?.wood);
    for (const p of new THREE.CatmullRomCurve3(w.trunk).getPoints(12)) out.push({ at: [p.x, p.z], r: w.r0 });
  }
  if (hasCrabs(spec)) out.push(dishSpot(L));
  return out;
}

const plantBases = (L: Layout, spec: TerrariumSpec) => layoutOf(spec).map((uv) => pointIn(L.groundFp, ...uv));

/**
 * Toward the viewer, on the floor: between the jar pages' straight-on view and the
 * builder's corner view (camera.tsx), so a spot clear of both is clear of either.
 */
const TOWARD_VIEWER: [number, number] = [Math.sin(0.33), Math.cos(0.33)];

/** How much the plants stand between a spot and the viewer. */
function hiddenBehindPlants(bases: [number, number][], x: number, z: number) {
  let hidden = 0;
  for (const [px, pz] of bases) {
    const dx = px - x;
    const dz = pz - z;
    const along = dx * TOWARD_VIEWER[0] + dz * TOWARD_VIEWER[1];
    const across = Math.abs(dx * TOWARD_VIEWER[1] - dz * TOWARD_VIEWER[0]);
    if (along > 0 && across < 0.3) hidden += 1 - across / 0.3;
  }
  return hidden;
}

/**
 * Where the stone goes until someone moves it: clear of the log and the dish, as far from
 * the plants as it can be, and not hidden behind a plant from where people look.
 */
export function stoneHome(L: Layout, spec: TerrariumSpec): [number, number] {
  const hard = solid(L, spec);
  const bases = plantBases(L, spec);
  const r = stoneSize(L) * 1.45;
  let best: [number, number] = [0.55, 0.05];
  let bestScore = -Infinity;
  for (let u = -0.8; u <= 0.81; u += 0.1) {
    for (let v = -0.8; v <= 0.81; v += 0.1) {
      const [x, z] = pointIn(L.groundFp, u, v);
      if (!insideFp(L.groundFp, x, z, r)) continue;
      // Overlapping the log or the dish costs far more than anything else, so on a crowded
      // floor the stone still takes the least bad spot rather than none.
      const overlap = Math.max(0, ...hard.map((t) => t.r + r - Math.hypot(x - t.at[0], z - t.at[1])));
      // Room from the plant bases, worth less than being seen: a stone among plants looks natural.
      const room = Math.min(0.25, ...bases.map(([px, pz]) => Math.hypot(x - px, z - pz) - 0.12 - r));
      const score = room - 0.5 * hiddenBehindPlants(bases, x, z) + 0.04 * v - 4 * overlap;
      if (score > bestScore) {
        bestScore = score;
        best = [u, v];
      }
    }
  }
  return best;
}

/** Where the stone sits, in scene x, z. */
export function stoneSpot(L: Layout, spec: TerrariumSpec): [number, number] {
  return pointIn(L.groundFp, ...(spec.placed?.stone?.at ?? stoneHome(L, spec)));
}

/** Ground-level things the animals walk around: x, z and radius in scene units. */
export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

export function obstaclesFor(L: Layout, spec: TerrariumSpec): Obstacle[] {
  const out: Obstacle[] = [];
  if (spec.hardscape.includes('stone')) {
    const [x, z] = stoneSpot(L, spec);
    // Measured: the stone's outline reaches about 1.45 times its size from the middle.
    out.push({ x, z, r: stoneSize(L) * 1.45 });
  }
  if (hasCrabs(spec)) {
    const d = dishSpot(L);
    out.push({ x: d.at[0], z: d.at[1], r: d.r + 0.02 });
  }
  return out;
}
