import { useMemo } from 'react';
import * as THREE from 'three';
import type { TerrariumSpec } from '../../engine/index.js';
import { clamp } from './noise.js';
import { footprint, groundGeometry, SHAPES, type Footprint, type Shape } from './vessel.js';

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

export function useLayout(spec: TerrariumSpec): Layout {
  return useMemo(() => {
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
  }, [spec.vessel, spec.drainage, spec.depth, spec.seed, spec.sizeL]);
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

/** The driftwood: a log from the left rising toward the back right, with one branch. Mushrooms grow on it. */
export function woodPath(L: Layout) {
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
