import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Bodies for the animals, built from parts and merged into one geometry each, so a
 * whole colony is still one instanced draw. Unit space, as the plain ellipsoids were:
 * the body spans -1..1 on every axis (x across, y up, z forward) and is scaled per
 * species by Look.scale. The ground sits at y = -0.7, where the legs reach.
 *
 * Material groups: 0 shell, 1 legs and underside, 2 accent (face, claws), 3 wings, 4 eyes.
 */
export type Body = 'isopod' | 'springtail' | 'crab' | 'gnat';

const GROUND = -0.7;
/** Light quality builds every part with fewer segments: same outline, about half the triangles. */
let lite = false;
const SHELL = 0;
const LIMB = 1;
const ACCENT = 2;
const WING = 3;
const EYE = 4;

/** A tube along a few points, rounded off: legs, antennae, stalks. */
function limb(points: [number, number, number][], radius: number, radial = 4): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  // Few segments: a whole colony is drawn, and at this size a leg is a few pixels.
  return new THREE.TubeGeometry(curve, lite ? points.length : points.length * 2, radius, lite ? 3 : radial, false);
}

/** Left and right copies of a part (mirrored across x). */
function pair(make: (side: 1 | -1) => THREE.BufferGeometry): THREE.BufferGeometry[] {
  return [make(1), make(-1)];
}

function ellipsoid(rx: number, ry: number, rz: number, at: [number, number, number], w = 12, h = 8) {
  return new THREE.SphereGeometry(1, lite ? Math.ceil(w * 0.6) : w, lite ? Math.ceil(h * 0.6) : h).scale(rx, ry, rz).translate(...at);
}

/** Parts tagged with their material group, merged into one geometry. */
function build(parts: [THREE.BufferGeometry, number][]): THREE.BufferGeometry {
  const byGroup = new Map<number, THREE.BufferGeometry[]>();
  for (const [g, group] of parts) {
    // Smooth normals while the part still shares its vertices, then unshare to merge.
    g.computeVertexNormals();
    const clean = g.index ? g.toNonIndexed() : g;
    // Every part needs the same attributes to merge: drop what only some have.
    for (const name of Object.keys(clean.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') clean.deleteAttribute(name);
    byGroup.set(group, [...(byGroup.get(group) ?? []), clean]);
  }
  const groups = [...byGroup.keys()].sort();
  // One merged piece per group, then the groups merged with useGroups so each keeps its material slot.
  const merged = mergeGeometries(groups.map((g) => mergeGeometries(byGroup.get(g)!)!), true)!;
  merged.groups.forEach((gr, i) => (gr.materialIndex = groups[i]!));
  return merged;
}

/** A segmented dorsal shell: a flattened ellipsoid with ridges between the plates and scalloped sides. */
function segmentedShell(segments: number, flare: number): THREE.BufferGeometry {
  // Poles at head and tail, so the sphere's rings run across the body like the plates do.
  const g = new THREE.SphereGeometry(1, lite ? 12 : 18, segments * (lite ? 3 : 5)).rotateX(Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // Plates get smaller toward the tail: space the ridges by a stretched z.
    const t = (v.z + 1) / 2;
    const ridge = 0.5 + 0.5 * Math.cos(Math.PI * 2 * segments * Math.pow(t, 0.85));
    const top = Math.max(0, v.y);
    // A sharp seam between plates (the ridge raised to a power), not a gentle wave.
    const seam = Math.pow(ridge, 6);
    v.y = v.y < 0 ? v.y * 0.3 : v.y * (1 - 0.16 * seam);
    // Side plates stick out a little and dip at each seam.
    const side = 1 - top;
    v.x *= 1 + flare * side * (1 - 0.6 * seam);
    // A blunt head and a tapering tail.
    v.x *= v.z > 0.75 ? 1 - (v.z - 0.75) * 0.9 : 1;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

function isopod(): THREE.BufferGeometry {
  const parts: [THREE.BufferGeometry, number][] = [[segmentedShell(9, 0.1), SHELL]];
  // The underside, slightly smaller, in the leg colour.
  parts.push([ellipsoid(0.92, 0.2, 0.95, [0, -0.08, 0], 12, 6), LIMB]);
  // Seven pairs of walking legs, knees out, feet on the ground.
  for (let k = 0; k < 7; k++) {
    const z = 0.62 - k * 0.2;
    for (const leg of pair((s) => limb([[s * 0.7, -0.12, z], [s * 1.12, -0.18, z + 0.05], [s * 1.22, GROUND + 0.05, z + 0.12]], 0.045))) parts.push([leg, LIMB]);
  }
  // Antennae sweep forward and out.
  for (const a of pair((s) => limb([[s * 0.25, 0.05, 0.92], [s * 0.6, 0.12, 1.35], [s * 1.05, 0.02, 1.7], [s * 1.35, -0.15, 1.85]], 0.04))) parts.push([a, LIMB]);
  // Tail prongs (uropods).
  for (const u of pair((s) => new THREE.ConeGeometry(0.1, 0.4, 6).rotateX(-Math.PI / 2).translate(s * 0.28, -0.05, -1.12))) parts.push([u, LIMB]);
  // The head, in the accent colour (the rubber ducky's yellow face; the shell colour otherwise).
  parts.push([ellipsoid(0.5, 0.42, 0.28, [0, 0.02, 0.86], 10, 6), ACCENT]);
  return build(parts);
}

function springtail(): THREE.BufferGeometry {
  const parts: [THREE.BufferGeometry, number][] = [[ellipsoid(1, 1, 1, [0, 0, 0], 16, 12), SHELL]];
  for (const a of pair((s) => limb([[s * 0.3, 0.3, 0.9], [s * 0.55, 0.6, 1.5], [s * 0.7, 0.7, 2.1]], 0.12))) parts.push([a, LIMB]);
  for (let k = 0; k < 3; k++) {
    const z = 0.5 - k * 0.45;
    for (const leg of pair((s) => limb([[s * 0.6, -0.3, z], [s * 1.0, GROUND + 0.05, z + 0.1]], 0.1))) parts.push([leg, LIMB]);
  }
  return build(parts);
}

function crab(): THREE.BufferGeometry {
  // A squarish carapace, wider than long, domed and flat beneath.
  const shell = new THREE.SphereGeometry(1, lite ? 14 : 24, lite ? 9 : 14);
  const p = shell.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.x = Math.sign(v.x) * Math.pow(Math.abs(v.x), 0.75);
    v.z = Math.sign(v.z) * Math.pow(Math.abs(v.z), 0.8) * (v.z > 0 ? 0.9 : 1);
    v.y = v.y < 0 ? v.y * 0.35 : v.y * (1 - 0.25 * v.z * v.z);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const parts: [THREE.BufferGeometry, number][] = [[shell, SHELL]];
  // Eyes on short stalks at the front corners.
  for (const st of pair((s) => limb([[s * 0.42, 0.35, 0.78], [s * 0.5, 0.65, 0.95]], 0.07))) parts.push([st, LIMB]);
  for (const e of pair((s) => ellipsoid(0.14, 0.14, 0.14, [s * 0.5, 0.7, 0.98]))) parts.push([e, EYE]);
  // Claws: an arm forward and in, a swollen hand, and a finger.
  for (const s of [1, -1] as const) {
    parts.push([limb([[s * 0.75, -0.05, 0.6], [s * 0.95, 0.0, 1.0], [s * 0.7, 0.05, 1.35]], 0.11), ACCENT]);
    parts.push([ellipsoid(0.24, 0.2, 0.36, [s * 0.6, 0.08, 1.55], 14, 10), ACCENT]);
    parts.push([new THREE.ConeGeometry(0.07, 0.38, 6).rotateX(Math.PI / 2).translate(s * 0.48, 0.05, 1.95), ACCENT]);
  }
  // Four pairs of walking legs, splayed out sideways, each bent at the knee.
  for (let k = 0; k < 4; k++) {
    const z = 0.45 - k * 0.38;
    const reach = 1.85 - Math.abs(k - 1.5) * 0.18;
    for (const leg of pair((s) => limb([[s * 0.85, -0.1, z], [s * 1.35, 0.35, z - 0.05], [s * reach, 0.0, z - 0.12], [s * (reach + 0.25), GROUND + 0.04, z - 0.2]], 0.07, 5))) parts.push([leg, LIMB]);
  }
  return build(parts);
}

function gnat(): THREE.BufferGeometry {
  const parts: [THREE.BufferGeometry, number][] = [[ellipsoid(0.7, 0.7, 1.3, [0, 0, 0], 12, 8), SHELL]];
  for (const w of pair((s) => new THREE.CircleGeometry(1, 12).scale(0.55, 1.4, 1).rotateX(-Math.PI / 2).rotateY(s * 0.5).translate(s * 0.55, 0.45, -0.3))) parts.push([w, WING]);
  for (let k = 0; k < 3; k++) for (const leg of pair((s) => limb([[s * 0.4, -0.4, 0.4 - k * 0.4], [s * 1.1, -1.2, 0.3 - k * 0.5]], 0.06))) parts.push([leg, LIMB]);
  return build(parts);
}

const cache = new Map<string, THREE.BufferGeometry>();
/** Shared across colonies and swatches; never disposed. */
export function critterGeometry(body: Body, quality: 'high' | 'low' = 'high'): THREE.BufferGeometry {
  const key = `${body}:${quality}`;
  let g = cache.get(key);
  if (!g) {
    lite = quality === 'low';
    g = body === 'isopod' ? isopod() : body === 'springtail' ? springtail() : body === 'crab' ? crab() : gnat();
    lite = false;
    cache.set(key, g);
  }
  return g;
}

export interface CritterColors {
  shell: string;
  limb: string;
  accent?: string;
  eye?: string;
  /** Pattern on the shell (the dairy cow's patches, the magic potion's flecks). */
  map?: THREE.Texture | null;
  rough: number;
}

/** The materials for one species, in group order: shell, legs, accent, wings, eyes. */
export function critterMaterials(c: CritterColors): THREE.Material[] {
  const shell = new THREE.MeshStandardMaterial({ color: c.shell, roughness: c.rough, map: c.map ?? null });
  const limb = new THREE.MeshStandardMaterial({ color: c.limb, roughness: 0.6 });
  const accent = c.accent ? new THREE.MeshStandardMaterial({ color: c.accent, roughness: 0.35 }) : shell;
  const wing = new THREE.MeshStandardMaterial({ color: '#d8dde0', roughness: 0.2, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const eye = new THREE.MeshStandardMaterial({ color: c.eye ?? '#151515', roughness: 0.2 });
  return [shell, limb, accent, wing, eye];
}
