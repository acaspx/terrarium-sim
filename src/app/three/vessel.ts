import * as THREE from 'three';
import type { VesselId } from '../../engine/index.js';
import { fbm, smoothstep } from './noise.js';

/**
 * Vessel shapes in scene units. The floor of every vessel sits at y = 0 and
 * its widest interior is about one unit from the centre, so a 1 L jar and a
 * 40 L case are drawn the same size, as on the shelf.
 */
export type Shape =
  | { kind: 'round'; profile: [number, number][]; top: number; openBottom?: boolean }
  | { kind: 'square'; hx: number; hz: number; wallTop: number; top: number; roof: boolean };

const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
  });

/**
 * Round off every corner of a lathe profile, as blown glass is: each interior point
 * becomes a short curve between points part-way along its two segments. Long, straight
 * runs (a jar's wall) stay straight; the short steps of an arc barely move. The ends
 * (the centre of the floor and the rim) are kept exactly.
 */
function fillet(pts: [number, number][], rMax = 0.22): [number, number][] {
  const out: [number, number][] = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i]!;
    const [ax, ay] = pts[i - 1]!;
    const [bx, by] = pts[i + 1]!;
    const la = Math.hypot(ax - px, ay - py);
    const lb = Math.hypot(bx - px, by - py);
    // How sharply the profile turns here. Gentle turns (the steps of an arc, a straight
    // run) are already smooth; only real corners are rounded, with points to match.
    const dot = ((px - ax) * (bx - px) + (py - ay) * (by - py)) / (la * lb || 1);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    if (la < 1e-6 || lb < 1e-6 || angle < 0.1) {
      out.push([px, py]);
      continue;
    }
    // Never more than 45% of either segment, so neighbouring curves don't overlap.
    const d = Math.min(rMax, la * 0.45, lb * 0.45);
    const q0x = px + ((ax - px) / la) * d, q0y = py + ((ay - py) / la) * d;
    const q1x = px + ((bx - px) / lb) * d, q1y = py + ((by - py) / lb) * d;
    const steps = Math.max(2, Math.ceil(angle / 0.07));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      out.push([a * q0x + b * px + c * q1x, a * q0y + b * py + c * q1y]);
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

const BOWL_R = 1.08;
const BOWL_CY = 1.0;

export const SHAPES: Record<VesselId, Shape> = {
  jar: {
    kind: 'round', top: 2.0,
    profile: fillet([[0, 0], [0.9, 0], [0.97, 0.03], [1, 0.1], [1, 1.6], [0.97, 1.72], [0.84, 1.82], [0.72, 1.87], [0.72, 2.0]]),
  },
  bottle: {
    kind: 'round', top: 2.3,
    profile: fillet([[0, 0], [0.62, 0], [0.88, 0.08], [1.02, 0.3], [1.06, 0.6], [1.02, 0.95], [0.88, 1.2], [0.62, 1.42], [0.34, 1.56], [0.22, 1.66], [0.22, 2.3]], 0.3),
  },
  cloche: {
    kind: 'round', top: 2.1, openBottom: true,
    profile: fillet([[0.95, 0], [0.95, 1.15], ...arc(0, 1.15, 0.95, 0.12, Math.PI / 2, 28)]),
  },
  bowl: {
    kind: 'round', top: 1.75,
    profile: fillet([[0, 0], ...arc(0, BOWL_CY, BOWL_R, -Math.asin(BOWL_CY / BOWL_R), Math.asin(0.75 / BOWL_R), 36)]),
  },
  cube: { kind: 'square', hx: 0.95, hz: 0.95, wallTop: 1.95, top: 1.95, roof: false },
  wardian: { kind: 'square', hx: 1.0, hz: 0.78, wallTop: 1.3, top: 2.05, roof: true },
};

/** Inner radius of a round vessel at height y. */
export function radiusAt(shape: Extract<Shape, { kind: 'round' }>, y: number): number {
  const p = shape.profile;
  let best = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const [r0, y0] = p[i]!;
    const [r1, y1] = p[i + 1]!;
    if (y1 === y0) {
      if (Math.abs(y - y0) < 1e-6) best = Math.max(best, r0, r1);
      continue;
    }
    const lo = Math.min(y0, y1);
    const hi = Math.max(y0, y1);
    if (y >= lo && y <= hi) best = Math.max(best, r0 + ((r1 - r0) * (y - y0)) / (y1 - y0));
  }
  if (best === 0 && y <= 0) best = Math.max(...p.filter(([, py]) => py === p[0]![1]).map(([r]) => r));
  return best;
}

export type Footprint = { kind: 'circle'; r: number } | { kind: 'rect'; hx: number; hz: number };

export function footprint(shape: Shape, y: number, inset: number): Footprint {
  if (shape.kind === 'round') return { kind: 'circle', r: Math.max(0.02, radiusAt(shape, y) - inset) };
  return { kind: 'rect', hx: shape.hx - inset, hz: shape.hz - inset };
}

/** Map u, v in [-1, 1] into the footprint. */
export function pointIn(fp: Footprint, u: number, v: number): [number, number] {
  if (fp.kind === 'rect') return [u * fp.hx, v * fp.hz];
  let x = u * fp.r;
  let z = v * fp.r;
  const d = Math.hypot(x, z);
  if (d > fp.r * 0.88) {
    x *= (fp.r * 0.88) / d;
    z *= (fp.r * 0.88) / d;
  }
  return [x, z];
}

/** Distance from (bx, bz) along direction (dx, dz) to the wall of the footprint. */
export function distToWall(fp: Footprint, bx: number, bz: number, dx: number, dz: number): number {
  if (fp.kind === 'circle') {
    const bd = bx * dx + bz * dz;
    const c = bx * bx + bz * bz - fp.r * fp.r;
    return Math.max(0, -bd + Math.sqrt(Math.max(0, bd * bd - c)));
  }
  const tx = dx === 0 ? Infinity : ((dx > 0 ? fp.hx : -fp.hx) - bx) / dx;
  const tz = dz === 0 ? Infinity : ((dz > 0 ? fp.hz : -fp.hz) - bz) / dz;
  return Math.max(0, Math.min(tx, tz));
}

export function insideFp(fp: Footprint, x: number, z: number, margin = 0): boolean {
  if (fp.kind === 'circle') return Math.hypot(x, z) <= fp.r - margin;
  return Math.abs(x) <= fp.hx - margin && Math.abs(z) <= fp.hz - margin;
}

// ------------------------------------------------------------------ geometry

/** The glass itself. */
export function glassGeometry(shape: Shape): THREE.BufferGeometry {
  if (shape.kind === 'round') {
    return new THREE.LatheGeometry(shape.profile.map(([r, y]) => new THREE.Vector2(r, y)), 128);
  }
  if (!shape.roof) {
    const g = new THREE.BoxGeometry(shape.hx * 2, shape.wallTop, shape.hz * 2);
    g.translate(0, shape.wallTop / 2, 0);
    return g;
  }
  const s = new THREE.Shape();
  s.moveTo(-shape.hx, 0);
  s.lineTo(shape.hx, 0);
  s.lineTo(shape.hx, shape.wallTop);
  s.lineTo(0, shape.top);
  s.lineTo(-shape.hx, shape.wallTop);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: shape.hz * 2, bevelEnabled: false });
  g.translate(0, 0, -shape.hz);
  return g;
}

/** A solid slab of the vessel's interior between two heights (drainage, substrate, water). */
export function layerGeometry(shape: Shape, y0: number, y1: number, inset: number): THREE.BufferGeometry {
  if (shape.kind === 'square') {
    const g = new THREE.BoxGeometry((shape.hx - inset) * 2, Math.max(0.001, y1 - y0), (shape.hz - inset) * 2);
    g.translate(0, (y0 + y1) / 2, 0);
    return g;
  }
  // Enough rows that a layer following a curved wall (a bowl, a bottle) reads as curved through the glass.
  const n = 28;
  const pts = [new THREE.Vector2(0, y0)];
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    pts.push(new THREE.Vector2(Math.max(0.01, radiusAt(shape, Math.max(0.005, y)) - inset), y));
  }
  pts.push(new THREE.Vector2(0, y1));
  return new THREE.LatheGeometry(pts, 96);
}

export interface Ground {
  geometry: THREE.BufferGeometry;
  heightAt: (x: number, z: number) => number;
}

/** The top of the substrate: rises toward the back, as a planted terrarium is usually sloped, with small lumps. */
export function groundGeometry(shape: Shape, gy: number, seed: number, inset: number): Ground {
  const fp = footprint(shape, gy, inset);
  const ext = fp.kind === 'circle' ? fp.r : Math.max(fp.hx, fp.hz);
  const edge = (x: number, z: number) => {
    const d = fp.kind === 'circle' ? Math.hypot(x, z) / fp.r : Math.max(Math.abs(x) / fp.hx, Math.abs(z) / fp.hz);
    return 1 - smoothstep(0.78, 1, d);
  };
  const heightAt = (x: number, z: number) => {
    const slope = (-z / ext) * 0.09 + 0.05;
    const lumps = (fbm(x * 2.2 + 10, z * 2.2 + seed * 0.37, 3) - 0.5) * 0.08;
    return gy + 0.004 + Math.max(0, slope + lumps) * edge(x, z);
  };
  const w = fp.kind === 'circle' ? fp.r * 2 : fp.hx * 2;
  const d = fp.kind === 'circle' ? fp.r * 2 : fp.hz * 2;
  const g = new THREE.PlaneGeometry(w, d, 56, 56);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let z = pos.getZ(i);
    if (fp.kind === 'circle') {
      const r = Math.hypot(x, z);
      // Square grid pulled onto the disc: the corners collapse onto the rim.
      const maxR = fp.r;
      const k = Math.max(Math.abs(x), Math.abs(z)) / (maxR || 1);
      if (r > 0) {
        const scale = (k * maxR) / r;
        x *= scale;
        z *= scale;
      }
    }
    pos.setXYZ(i, x, heightAt(x, z), z);
  }
  g.computeVertexNormals();
  return { geometry: g, heightAt };
}
