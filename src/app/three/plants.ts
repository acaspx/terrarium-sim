import * as THREE from 'three';
import { fittoniaTexture, lumpTexture, strapLeafTexture } from './textures.js';

/**
 * Plants built from simulation state, in local units: origin at the base of
 * the plant, +Y up, roughly sized for a 6 L vessel (the scene scales them).
 *   s       share of the species' maximum size (sqrt of biomass share)
 *   turgor  water pressure in the leaves: low turgor droops
 *   health  slow-moving: low health browns the leaves
 */

export interface PlantInput {
  s: number;
  turgor: number;
  health: number;
  dry: number;
  rng: () => number;
  leaf: THREE.Color;
  accent: THREE.Color;
  /** Local distance from the base to the glass in direction (dx, dz) at local height y. */
  wallDist: (dx: number, dz: number, y: number) => number;
  /** Local height of the soil surface at local (x, z). */
  groundAt: (x: number, z: number) => number;
  /** Local height a climber must stay under (the lid or roof). */
  ceiling: number;
}

export interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  instances?: { matrix: THREE.Matrix4; color: THREE.Color }[];
  /** This part owns its geometry, and should dispose it when the plant is rebuilt. */
  owned: boolean;
  /**
   * This part owns its material too. Most materials are shared between plants and kept for
   * the life of the page; disposing a shared one forces every plant using it to recompile.
   */
  ownsMaterial?: boolean;
}

const DYING = new THREE.Color('#9b8650');
const WHITE = new THREE.Color('#ffffff');
const SICK_TINT = new THREE.Color('#c4a467');

// ------------------------------------------------------------------ helpers

export function taperedTube(pts: THREE.Vector3[], r0: number, r1: number, segs = 16, radial = 6): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts);
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, p);
    const r = r0 + (r1 - r0) * t;
    const N = frames.normals[i]!;
    const B = frames.binormals[i]!;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const sn = Math.sin(a);
      const cs = -Math.cos(a);
      n.set(cs * N.x + sn * B.x, cs * N.y + sn * B.y, cs * N.z + sn * B.z).normalize();
      pos.push(p.x + r * n.x, p.y + r * n.y, p.z + r * n.z);
      nor.push(n.x, n.y, n.z);
      uv.push(t, j / radial);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = (i + 1) * (radial + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function mergeAll(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  let icount = 0;
  for (const g of geoms) {
    count += g.attributes.position!.count;
    icount += g.index!.count;
  }
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const idx = new Uint32Array(icount);
  let vo = 0;
  let io = 0;
  for (const g of geoms) {
    pos.set(g.attributes.position!.array as Float32Array, vo * 3);
    nor.set(g.attributes.normal!.array as Float32Array, vo * 3);
    uv.set(g.attributes.uv!.array as Float32Array, vo * 2);
    const gi = g.index!.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i]! + vo;
    vo += g.attributes.position!.count;
    io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

const leafCache = new Map<string, THREE.BufferGeometry>();

/**
 * A leaf: base at the origin, tip along +Y, upper face toward -Z.
 * `curl` bends the tip down (toward +Z), `cup` lifts the edges.
 */
export function leafGeometry(len: number, wid: number, curl = 0.25, cup = 0.25, shape: 'ovate' | 'round' | 'narrow' = 'ovate') {
  const key = `${len}|${wid}|${curl}|${cup}|${shape}`;
  const hit = leafCache.get(key);
  if (hit) return hit;
  const g = new THREE.PlaneGeometry(1, 1, 4, 8);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) * 2;
    const v = pos.getY(i) + 0.5;
    const outline =
      shape === 'round' ? Math.sin(Math.PI * Math.pow(v, 0.75)) :
      shape === 'narrow' ? Math.sin(Math.PI * v) * (1 - 0.3 * v) :
      Math.sin(Math.PI * Math.pow(v, 0.8));
    const hw = (wid / 2) * outline;
    const x = u * hw;
    const y = v * len;
    const z = curl * v * v * len - Math.abs(u) * hw * cup;
    pos.setXYZ(i, -x, y, z);
  }
  // Mirroring x flips the winding, so the front (upper) face now looks toward -Z.
  g.computeVertexNormals();
  leafCache.set(key, g);
  return g;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
/** Place a leaf: tilt from vertical, azimuth around Y, roll about its own axis. */
function at(pos: THREE.Vector3, tilt: number, azimuth: number, roll: number, scale: number) {
  _e.set(tilt, azimuth, roll, 'YXZ');
  _q.setFromEuler(_e);
  _s.setScalar(scale);
  return new THREE.Matrix4().compose(pos.clone(), _q.clone(), _s.clone());
}

const UP = new THREE.Vector3(0, 1, 0);
function alongNormal(pos: THREE.Vector3, normal: THREE.Vector3, scale: THREE.Vector3, spin: number) {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, normal.clone().normalize());
  q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, spin));
  return new THREE.Matrix4().compose(pos.clone(), q, scale.clone());
}

function bezier(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, t: number) {
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const c = t * t;
  return new THREE.Vector3(a * p0.x + b * p1.x + c * p2.x, a * p0.y + b * p1.y + c * p2.y, a * p0.z + b * p1.z + c * p2.z);
}

function sickness(health: number) {
  return Math.pow(1 - health, 1.4);
}

function tinted(base: THREE.Color, health: number, rng: () => number, vary = 0.08) {
  const c = base.clone().lerp(DYING, sickness(health));
  c.offsetHSL((rng() - 0.5) * 0.02, 0, (rng() - 0.5) * vary);
  return c;
}

// ------------------------------------------------------------------ materials

const mats = new Map<string, THREE.Material>();
function shared<T extends THREE.Material>(key: string, make: () => T): T {
  let m = mats.get(key) as T | undefined;
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m;
}

const leafMat = () =>
  shared('leaf', () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.55, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color('#d8f0c8'), side: THREE.DoubleSide }));
const glossyLeafMat = () =>
  shared('leaf-gloss', () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.4, side: THREE.DoubleSide }));
const fittoniaMat = () =>
  shared('fittonia', () => new THREE.MeshPhysicalMaterial({ map: fittoniaTexture(), color: 0xffffff, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.5, side: THREE.DoubleSide }));
const strapMat = () =>
  shared('strap', () => new THREE.MeshPhysicalMaterial({ map: strapLeafTexture(), color: 0xffffff, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.3, side: THREE.DoubleSide }));
const stemMat = (hex: string) =>
  shared(`stem-${hex}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.7 }));
const tuftMat = () =>
  shared('tuft', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));

function stemColor(c: THREE.Color, health: number) {
  return `#${c.clone().lerp(DYING, sickness(health)).multiplyScalar(0.8).getHexString()}`;
}

// ------------------------------------------------------------------ species

function fittonia(p: PlantInput): Part[] {
  const n = 4 + Math.round(p.s * 9);
  const leaves: Part['instances'] = [];
  const stems: THREE.BufferGeometry[] = [];
  const tint = WHITE.clone().lerp(SICK_TINT, sickness(p.health));
  for (let i = 0; i < n; i++) {
    const az = i * 2.39996 + p.rng() * 0.5;
    const tilt = Math.min(2.1, 0.5 + 0.7 * (i / n) + (1 - p.turgor) * 0.95);
    const stemLen = (0.03 + 0.08 * p.s) * (0.7 + 0.5 * p.rng());
    const st = tilt * 0.75;
    const dx = Math.sin(az);
    const dz = Math.cos(az);
    const end = new THREE.Vector3(dx * Math.sin(st) * stemLen, Math.cos(st) * stemLen, dz * Math.sin(st) * stemLen);
    const mid = end.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, stemLen * 0.15, 0));
    stems.push(taperedTube([new THREE.Vector3(0, 0, 0), mid, end], 0.006, 0.004, 6, 5));
    leaves.push({ matrix: at(end, tilt + 0.25, az, (p.rng() - 0.5) * 0.4, (0.75 + 0.55 * p.s) * (0.8 + 0.3 * p.rng())), color: tint.clone().offsetHSL(0, 0, (p.rng() - 0.5) * 0.08) });
  }
  return [
    { geometry: mergeAll(stems), material: stemMat(stemColor(new THREE.Color('#5b7a4a'), p.health)), owned: true },
    { geometry: leafGeometry(0.13, 0.09, 0.18, 0.3), material: fittoniaMat(), instances: leaves, owned: false },
  ];
}

function creepingFig(p: PlantInput): Part[] {
  const total = 0.15 + 2.2 * p.s * p.s;
  // Head for the glass, favouring the back wall where it is seen through the jar.
  const az = Math.PI + (p.rng() - 0.5) * 1.6;
  const dx = Math.sin(az);
  const dz = Math.cos(az);
  const px = Math.cos(az);
  const pz = -Math.sin(az);
  const run = Math.max(0.05, p.wallDist(dx, dz, 0) - 0.035);
  const groundRun = Math.min(total, run);
  const pts: THREE.Vector3[] = [];
  const leaves: Part['instances'] = [];
  const step = 0.03;
  for (let d = 0, k = 0; d <= total; d += step, k++) {
    let pt: THREE.Vector3;
    let onWall = false;
    if (d <= groundRun) {
      const w = Math.sin(d * 11) * 0.03;
      const x = dx * d + px * w;
      const z = dz * d + pz * w;
      pt = new THREE.Vector3(x, p.groundAt(x, z) + 0.008, z);
    } else {
      const h = d - groundRun;
      const wd = Math.max(0.02, p.wallDist(dx, dz, h) - 0.03);
      const w = Math.sin(h * 7) * 0.05;
      pt = new THREE.Vector3(dx * wd + px * w, h + p.groundAt(dx * run, dz * run), dz * wd + pz * w);
      if (pt.y > p.ceiling) break;
      onWall = true;
    }
    pts.push(pt);
    if (d > 0.02) {
      const side = k % 2 ? 1 : -1;
      const sz = (0.75 + 0.35 * p.rng()) * (0.85 + 0.15 * p.turgor);
      const c = tinted(d > total - 0.15 ? p.leaf.clone().lerp(new THREE.Color('#8fbf5a'), 0.35) : p.leaf, p.health, p.rng);
      leaves.push({
        matrix: onWall
          ? at(pt, 0.15 + (1 - p.turgor) * 0.4, az, side * (0.6 + p.rng() * 0.5), sz)
          : at(pt, 1.25 + (1 - p.turgor) * 0.25, az + side * (Math.PI / 2) + (p.rng() - 0.5) * 0.6, 0, sz),
        color: c,
      });
    }
  }
  const parts: Part[] = [
    { geometry: leafGeometry(0.05, 0.045, 0.08, 0.2, 'round'), material: glossyLeafMat(), instances: leaves, owned: false },
  ];
  if (pts.length >= 2) parts.push({ geometry: taperedTube(pts, 0.005, 0.003, Math.max(8, pts.length * 2), 5), material: stemMat(stemColor(p.accent, p.health)), owned: true });
  return parts;
}

function babyTears(p: PlantInput): Part[] {
  const n = 22 + Math.round(90 * p.s);
  const w = 0.05 + 0.15 * p.s;
  const h = (0.03 + 0.08 * p.s) * (0.45 + 0.55 * p.turgor);
  const leaves: Part['instances'] = [];
  for (let i = 0; i < n; i++) {
    const a = p.rng() * Math.PI * 2;
    const rr = Math.sqrt(p.rng());
    const x = Math.cos(a) * rr * w;
    const z = Math.sin(a) * rr * w;
    const y = h * Math.sqrt(Math.max(0, 1 - rr * rr)) * (0.75 + 0.25 * p.rng()) + p.groundAt(x, z);
    leaves.push({
      matrix: at(new THREE.Vector3(x, y, z), 0.9 + rr * 0.6 + (1 - p.turgor) * 0.3, Math.atan2(x, z) + (p.rng() - 0.5), 0, 0.8 + 0.4 * p.rng()),
      color: tinted(i % 3 ? p.leaf : p.accent, p.health, p.rng, 0.12),
    });
  }
  return [{ geometry: leafGeometry(0.022, 0.022, 0.1, 0.3, 'round'), material: glossyLeafMat(), instances: leaves, owned: false }];
}

function spikeMoss(p: PlantInput): Part[] {
  const n = 3 + Math.round(5 * p.s);
  const leaves: Part['instances'] = [];
  const stems: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + p.rng() * 0.6;
    const dx = Math.sin(az);
    const dz = Math.cos(az);
    const len = (0.08 + 0.22 * p.s) * (0.7 + 0.3 * p.rng());
    const lift = (0.04 + 0.05 * p.rng()) * (0.4 + 0.6 * p.turgor);
    const p0 = new THREE.Vector3(0, 0, 0);
    const p1 = new THREE.Vector3(dx * len * 0.5, lift, dz * len * 0.5);
    const tip = new THREE.Vector3(dx * len, 0, dz * len);
    tip.y = p.groundAt(tip.x, tip.z) + 0.01;
    stems.push(taperedTube([p0, bezier(p0, p1, tip, 0.33), bezier(p0, p1, tip, 0.66), tip], 0.004, 0.002, 10, 4));
    for (let t = 0.1; t < 1; t += 0.055) {
      const b = bezier(p0, p1, tip, t);
      for (const side of [-1, 1]) {
        leaves.push({
          matrix: at(b, 1.15 + p.rng() * 0.3, az + side * 0.95, 0, (1 - t * 0.5) * (0.9 + 0.2 * p.rng())),
          color: tinted(side > 0 ? p.leaf : p.accent, p.health, p.rng),
        });
      }
    }
  }
  return [
    { geometry: mergeAll(stems), material: stemMat(stemColor(p.leaf, p.health)), owned: true },
    { geometry: leafGeometry(0.022, 0.01, 0.15, 0.1, 'narrow'), material: leafMat(), instances: leaves, owned: false },
  ];
}

function cushionMoss(p: PlantInput): Part[] {
  const w = 0.07 + 0.17 * p.s;
  const h = 0.035 + 0.075 * p.s;
  const pale = new THREE.Color('#cfdac9');
  const base = tinted(p.leaf, p.health, p.rng, 0).lerp(pale, p.dry * 0.75);
  const mound = new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = mound.attributes.position as THREE.BufferAttribute;
  const seed = p.rng() * 50;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const bump = 1 + 0.12 * Math.sin(x * 9 + seed) * Math.cos(z * 8 + seed) + 0.06 * Math.sin(x * 23 + z * 19);
    pos.setXYZ(i, x * w * bump, Math.max(0, y * h * bump - 0.004), z * w * bump);
  }
  mound.computeVertexNormals();
  const material = new THREE.MeshPhysicalMaterial({
    color: base, roughness: 1, sheen: 1, sheenRoughness: 0.45, sheenColor: base.clone().lerp(new THREE.Color('#e8f5d0'), 0.5),
    bumpMap: lumpTexture(), bumpScale: 3,
  });
  const tufts: Part['instances'] = [];
  const n = 140 + Math.round(520 * p.s);
  for (let i = 0; i < n; i++) {
    const phi = p.rng() * Math.PI * 2;
    const th = Math.acos(1 - p.rng() * 0.98);
    const x = Math.sin(th) * Math.cos(phi) * w;
    const y = Math.cos(th) * h;
    const z = Math.sin(th) * Math.sin(phi) * w;
    const nrm = new THREE.Vector3(x / (w * w), y / (h * h), z / (w * w)).normalize();
    const c = (p.rng() < 0.7 ? p.leaf : p.accent).clone().lerp(DYING, sickness(p.health)).lerp(pale, p.dry * 0.8);
    c.offsetHSL(0, 0, (p.rng() - 0.3) * 0.12);
    tufts.push({ matrix: alongNormal(new THREE.Vector3(x, y, z), nrm, new THREE.Vector3(0.8 + 0.5 * p.rng(), 0.6 + 0.6 * p.rng(), 0.8 + 0.5 * p.rng()), p.rng() * 6), color: c });
  }
  return [
    { geometry: mound, material, owned: true, ownsMaterial: true },
    { geometry: tuftGeometry(), material: tuftMat(), instances: tufts, owned: false },
  ];
}

let _tuft: THREE.BufferGeometry | null = null;
function tuftGeometry() {
  if (!_tuft) {
    // A short, blunt tuft: moss reads as velvet, not spines.
    _tuft = new THREE.SphereGeometry(0.008, 6, 4);
    _tuft.scale(1, 1.3, 1);
  }
  return _tuft;
}

let _fan: THREE.BufferGeometry | null = null;
function fanGeometry() {
  if (!_fan) {
    const span = Math.PI * 0.85;
    _fan = new THREE.CircleGeometry(0.024, 12, Math.PI / 2 - span / 2, span);
    // Bring the lit face to -Z like the other leaves, and lift it off its stalk.
    _fan.rotateY(Math.PI);
    _fan.translate(0, 0.004, 0);
  }
  return _fan;
}

function maidenhair(p: PlantInput): Part[] {
  const n = 3 + Math.round(5 * p.s);
  const leaves: Part['instances'] = [];
  const stems: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + p.rng() * 0.8;
    const dx = Math.sin(az);
    const dz = Math.cos(az);
    const ht = (0.14 + 0.4 * p.s) * (0.7 + 0.3 * p.rng());
    const bend = 0.05 + 0.1 * p.rng() + (1 - p.turgor) * 0.22;
    const p0 = new THREE.Vector3(0, 0, 0);
    const p1 = new THREE.Vector3(dx * bend * 0.2, ht, dz * bend * 0.2);
    const p2 = new THREE.Vector3(dx * bend * 1.8, ht * (0.55 + 0.45 * p.turgor), dz * bend * 1.8);
    stems.push(taperedTube([p0, bezier(p0, p1, p2, 0.3), bezier(p0, p1, p2, 0.6), bezier(p0, p1, p2, 0.85), p2], 0.0035, 0.0018, 14, 4));
    for (let t = 0.42; t <= 1.001; t += 0.055) {
      const b = bezier(p0, p1, p2, t);
      for (const side of [-1, 1]) {
        leaves.push({
          matrix: at(b, 1.0 + p.rng() * 0.4 + (1 - p.turgor) * 0.4, az + side * (Math.PI / 2) + (p.rng() - 0.5) * 0.4, (p.rng() - 0.5) * 0.4, (1.1 - 0.5 * t) * (0.85 + 0.3 * p.rng())),
          color: tinted(p.leaf, p.health, p.rng, 0.1),
        });
      }
    }
  }
  return [
    { geometry: mergeAll(stems), material: stemMat('#2a231e'), owned: true },
    { geometry: fanGeometry(), material: leafMat(), instances: leaves, owned: false },
  ];
}

function birdsNestFern(p: PlantInput): Part[] {
  const n = 5 + Math.round(p.s * 9);
  const fronds: Part['instances'] = [];
  for (let i = 0; i < n; i++) {
    const young = i / n; // later fronds come up from the centre, more upright
    const az = i * 2.39996 + p.rng() * 0.4;
    const tilt = 0.75 - 0.5 * young + (1 - p.turgor) * 0.7 + (p.rng() - 0.5) * 0.15;
    fronds.push({
      matrix: at(new THREE.Vector3(0, 0.01, 0), tilt, az, (p.rng() - 0.5) * 0.3, (0.55 + 0.75 * p.s) * (0.8 + 0.35 * p.rng()) * (0.75 + 0.25 * (1 - young))),
      color: tinted(p.leaf, p.health, p.rng, 0.06),
    });
  }
  return [
    { geometry: leafGeometry(0.3, 0.07, 0.35, 0.18, 'narrow'), material: strapMat(), instances: fronds, owned: false },
    // The nest: a brown, hairy crown at the base.
    { geometry: crownGeometry(), material: stemMat('#4a3324'), owned: false },
  ];
}

let _crown: THREE.BufferGeometry | null = null;
function crownGeometry() {
  if (!_crown) {
    _crown = new THREE.SphereGeometry(0.022, 12, 8);
    _crown.scale(1, 0.6, 1);
  }
  return _crown;
}

function lemonButtonFern(p: PlantInput): Part[] {
  const n = 4 + Math.round(6 * p.s);
  const leaves: Part['instances'] = [];
  const stems: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + p.rng() * 0.7;
    const dx = Math.sin(az);
    const dz = Math.cos(az);
    const ht = (0.1 + 0.26 * p.s) * (0.75 + 0.3 * p.rng());
    const lean = 0.03 + 0.05 * p.rng() + (1 - p.turgor) * 0.15;
    const p0 = new THREE.Vector3(0, 0, 0);
    const p1 = new THREE.Vector3(dx * lean * 0.3, ht, dz * lean * 0.3);
    const p2 = new THREE.Vector3(dx * lean * 2, ht * (0.75 + 0.25 * p.turgor), dz * lean * 2);
    stems.push(taperedTube([p0, bezier(p0, p1, p2, 0.35), bezier(p0, p1, p2, 0.7), p2], 0.003, 0.0015, 12, 4));
    for (let t = 0.12; t <= 1.001; t += 0.06) {
      const b = bezier(p0, p1, p2, t);
      for (const side of [-1, 1]) {
        leaves.push({
          matrix: at(b, 1.2 + (1 - p.turgor) * 0.3, az + side * (Math.PI / 2), side * 0.3, (1.15 - 0.6 * t) * (0.9 + 0.2 * p.rng())),
          color: tinted(p.leaf, p.health, p.rng, 0.08),
        });
      }
    }
  }
  return [
    { geometry: mergeAll(stems), material: stemMat(stemColor(p.accent, p.health)), owned: true },
    { geometry: leafGeometry(0.02, 0.018, 0.05, 0.25, 'round'), material: leafMat(), instances: leaves, owned: false },
  ];
}

export const BUILDERS: Record<string, (p: PlantInput) => Part[]> = {
  fittonia,
  'creeping-fig': creepingFig,
  'baby-tears-pilea': babyTears,
  'spike-moss': spikeMoss,
  'cushion-moss': cushionMoss,
  'maidenhair-fern': maidenhair,
  'birds-nest-fern': birdsNestFern,
  'lemon-button-fern': lemonButtonFern,
};

export const PLANT_COLORS: Record<string, { leaf: string; accent: string }> = {
  fittonia: { leaf: '#2f5e3b', accent: '#f0d4da' },
  'creeping-fig': { leaf: '#4c7a37', accent: '#3a5f2a' },
  'baby-tears-pilea': { leaf: '#73a24a', accent: '#5d8a3b' },
  'spike-moss': { leaf: '#7fa84a', accent: '#5f8a34' },
  'cushion-moss': { leaf: '#6f9a5a', accent: '#9cbc84' },
  'maidenhair-fern': { leaf: '#79ac58', accent: '#2a231e' },
  'birds-nest-fern': { leaf: '#86b84c', accent: '#3a2a1e' },
  'lemon-button-fern': { leaf: '#93bf52', accent: '#6f8f3a' },
};

export function leafLitterGeometry() {
  return leafGeometry(0.07, 0.04, -0.05, 0.15);
}
