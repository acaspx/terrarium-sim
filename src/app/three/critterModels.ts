import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { taperedTube } from './plants.js';

/**
 * Bodies for the animals, built from parts and merged into one geometry each, so a
 * whole colony is still one instanced draw. Unit space, as the plain ellipsoids were:
 * the body spans -1..1 on every axis (x across, y up, z forward) and is scaled per
 * species by Look.scale. The ground sits at y = -0.7, where the legs reach.
 *
 * Material groups: 0 shell, 1 legs and underside, 2 accent (face, claws), 3 wings, 4 eyes.
 *
 * Moving parts carry a `motion` attribute (weight, phase, kind): how far from where the
 * part joins the body (0 there, 1 at its tip), its place in the gait, and what it does.
 * critterMaterials' shader moves them; see MOTION.
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

/** What a moving part does (the motion attribute's z). */
export const MOTION = { none: 0, leg: 1, antenna: 2, claw: 3, wing: 4 } as const;
interface Moves {
  kind: number;
  phase: number;
  /** Where it joins the body, and how long it is: the weight runs 0..1 along it. */
  from: [number, number, number];
  len: number;
}
type Part = [THREE.BufferGeometry, number, Moves?];

type V3 = [number, number, number];

/**
 * A tapering tube along a few points: legs, antennae, stalks, fingers. Thick where it
 * joins the body and fine at the tip, with a small rounded cap on the end, so a leg
 * reads as a jointed limb rather than a square rod.
 */
function limb(points: V3[], r0: number, r1 = r0 * 0.55, radial = 6): THREE.BufferGeometry {
  const pts = points.map((p) => new THREE.Vector3(...p));
  const segs = Math.max(2, (points.length - 1) * (lite ? 2 : 3));
  const tube = taperedTube(pts, r0, r1, segs, lite ? 4 : radial);
  if (lite) return tube;
  const tip = pts[pts.length - 1]!;
  const cap = new THREE.SphereGeometry(r1, radial, 4).translate(tip.x, tip.y, tip.z);
  cap.deleteAttribute('uv');
  tube.deleteAttribute('uv');
  return mergeGeometries([tube.toNonIndexed(), cap.toNonIndexed()])!;
}

/** Left and right copies of a part (mirrored across x). */
function pair(make: (side: 1 | -1) => THREE.BufferGeometry): THREE.BufferGeometry[] {
  return [make(1), make(-1)];
}

function ellipsoid(rx: number, ry: number, rz: number, at: V3, w = 24, h = 16) {
  return new THREE.SphereGeometry(1, lite ? Math.ceil(w * 0.5) : w, lite ? Math.ceil(h * 0.5) : h).scale(rx, ry, rz).translate(...at);
}

/**
 * Smooth normals across every seam: a sphere's or tube's first and last columns share
 * a position but not a vertex, so normals computed per vertex leave a hard crease down
 * one side. Faces are summed per position instead, so light rolls over the whole part.
 */
function smoothNormals(g: THREE.BufferGeometry) {
  const flat = g.index ? g.toNonIndexed() : g;
  const pos = flat.attributes.position as THREE.BufferAttribute;
  const key = (i: number) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const sums = new Map<string, THREE.Vector3>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    // Area-weighted face normal: big faces count for more, slivers for almost nothing.
    n.subVectors(c, b).cross(a.clone().sub(b));
    for (let k = 0; k < 3; k++) {
      const id = key(i + k);
      const sum = sums.get(id);
      if (sum) sum.add(n);
      else sums.set(id, n.clone());
    }
  }
  const nor = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = sums.get(key(i))!.clone().normalize();
    nor.set([v.x, v.y, v.z], i * 3);
  }
  flat.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return flat;
}

/** Parts tagged with their material group (and motion, if they move), merged into one geometry. */
function build(parts: Part[]): THREE.BufferGeometry {
  const byGroup = new Map<number, THREE.BufferGeometry[]>();
  for (const [g, group, moves] of parts) {
    const clean = smoothNormals(g);
    // Every part needs the same attributes to merge: drop what only some have, and give
    // every part a uv (the shell's pattern map reads it; the rest ignore it).
    for (const name of Object.keys(clean.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') clean.deleteAttribute(name);
    const pos = clean.attributes.position as THREE.BufferAttribute;
    if (!clean.attributes.uv) clean.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    const motion = new Float32Array(pos.count * 3);
    if (moves) {
      const from = new THREE.Vector3(...moves.from);
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        const w = moves.kind === MOTION.wing ? Math.abs(v.fromBufferAttribute(pos, i).x) / 1.1 : v.fromBufferAttribute(pos, i).distanceTo(from) / moves.len;
        motion.set([Math.min(1, w), moves.phase, moves.kind], i * 3);
      }
    }
    clean.setAttribute('motion', new THREE.BufferAttribute(motion, 3));
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
  // Enough rings per plate that each plate is a rounded band, not a facet.
  const g = new THREE.SphereGeometry(1, lite ? 14 : 20, segments * (lite ? 3 : 5)).rotateX(Math.PI / 2);
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
    // Each plate's back edge overlaps the next a little, as on a real pill bug: a slight
    // step down at every seam rather than a symmetric groove.
    const lap = 0.04 * Math.max(0, Math.sin(Math.PI * 2 * segments * Math.pow(t, 0.85)));
    v.y = v.y < 0 ? v.y * 0.3 : v.y * (1 - 0.16 * seam + lap);
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
  const parts: Part[] = [[segmentedShell(9, 0.1), SHELL]];
  // The underside, slightly smaller, in the leg colour.
  parts.push([ellipsoid(0.92, 0.2, 0.95, [0, -0.08, 0], 20, 8), LIMB]);
  // Seven pairs of walking legs, knees out, feet on the ground: thick at the hip, fine at
  // the foot. They step in a wave running from tail to head, the two sides half a stride apart.
  for (let k = 0; k < 7; k++) {
    const z = 0.62 - k * 0.2;
    for (const s of [1, -1] as const) {
      parts.push([limb([[s * 0.7, -0.12, z], [s * 1.08, -0.1, z + 0.04], [s * 1.2, -0.38, z + 0.09], [s * 1.24, GROUND + 0.04, z + 0.13]], 0.055, 0.022, 5), LIMB,
        { kind: MOTION.leg, phase: k * 0.9 + (s > 0 ? 0 : Math.PI), from: [s * 0.7, -0.12, z], len: 0.95 }]);
    }
  }
  // Antennae sweep forward and out, and feel about: a stout base and a long, fine whip.
  for (const s of [1, -1] as const) {
    parts.push([limb([[s * 0.25, 0.05, 0.92], [s * 0.55, 0.14, 1.25], [s * 0.85, 0.12, 1.55], [s * 1.15, 0.0, 1.75], [s * 1.38, -0.16, 1.86]], 0.05, 0.016), LIMB,
      { kind: MOTION.antenna, phase: s > 0 ? 0 : 2.1, from: [s * 0.25, 0.05, 0.92], len: 1.5 }]);
  }
  // Tail prongs (uropods): a short base and a tapering spine, splayed out.
  for (const u of pair((s) => limb([[s * 0.22, -0.04, -0.92], [s * 0.3, -0.06, -1.12], [s * 0.4, -0.09, -1.32]], 0.09, 0.025))) parts.push([u, LIMB]);
  // The head, in the accent colour (the rubber ducky's yellow face; the shell colour otherwise),
  // with the two side lobes isopods have, and a small dark eye on each side.
  parts.push([ellipsoid(0.5, 0.4, 0.28, [0, 0.02, 0.86], 16, 10), ACCENT]);
  for (const lobe of pair((s) => ellipsoid(0.16, 0.1, 0.14, [s * 0.4, -0.02, 0.98], 12, 8))) parts.push([lobe, ACCENT]);
  for (const e of pair((s) => ellipsoid(0.07, 0.06, 0.06, [s * 0.4, 0.12, 0.93], 10, 8))) parts.push([e, EYE]);
  return build(parts);
}

function springtail(): THREE.BufferGeometry {
  // A plump globular body: big round abdomen, a short thorax and a rounded head, each
  // slightly separate, as Collembola are. (The species' scale stretches it long.)
  const parts: Part[] = [
    // A couple of millimetres long on screen: fewer segments than the larger animals.
    [ellipsoid(0.86, 0.82, 0.62, [0, 0.02, -0.3], 16, 12), SHELL],
    [ellipsoid(0.66, 0.6, 0.38, [0, 0.04, 0.3], 14, 10), SHELL],
    [ellipsoid(0.52, 0.5, 0.36, [0, 0.0, 0.72], 14, 10), SHELL],
  ];
  // Dark eye patches on each side of the head.
  for (const e of pair((s) => ellipsoid(0.12, 0.1, 0.1, [s * 0.38, 0.16, 0.8], 10, 8))) parts.push([e, EYE]);
  // Antennae: four short segments, angled up and out.
  for (const a of pair((s) => limb([[s * 0.2, 0.25, 0.95], [s * 0.38, 0.55, 1.25], [s * 0.52, 0.72, 1.55], [s * 0.66, 0.78, 1.85]], 0.09, 0.05))) parts.push([a, LIMB]);
  // Three pairs of short legs under the front of the body.
  for (let k = 0; k < 3; k++) {
    const z = 0.55 - k * 0.32;
    for (const leg of pair((s) => limb([[s * 0.42, -0.3, z], [s * 0.78, -0.42, z + 0.06], [s * 0.92, GROUND + 0.04, z + 0.12]], 0.085, 0.045))) parts.push([leg, LIMB]);
  }
  // The furcula, the spring it jumps with: a forked tail folded forward under the belly.
  for (const f of pair((s) => limb([[0, -0.5, -0.75], [s * 0.1, -0.64, -0.35], [s * 0.16, -0.66, 0.05]], 0.08, 0.035))) parts.push([f, LIMB]);
  return build(parts);
}

/** One claw (chela): a swollen palm, a fixed finger and a hinged one that close on each other. */
function chela(s: 1 | -1, claw: Moves): Part[] {
  return [
    [limb([[s * 0.75, -0.05, 0.6], [s * 0.95, 0.0, 0.98], [s * 0.72, 0.05, 1.3]], 0.13, 0.11), ACCENT, claw],
    [ellipsoid(0.26, 0.22, 0.38, [s * 0.6, 0.08, 1.55], 24, 16), ACCENT, claw],
    // Fixed finger, along the outer edge, curving in at the tip.
    [limb([[s * 0.66, 0.02, 1.84], [s * 0.62, 0.0, 2.05], [s * 0.5, 0.0, 2.18]], 0.085, 0.03), ACCENT, claw],
    // The moving finger above it, closing down to meet.
    [limb([[s * 0.48, 0.16, 1.84], [s * 0.44, 0.2, 2.02], [s * 0.46, 0.08, 2.16]], 0.075, 0.026), ACCENT, claw],
  ];
}

function crab(): THREE.BufferGeometry {
  // A squarish carapace, wider than long, domed and flat beneath, with a low ridge
  // across the front between the eyes.
  const shell = new THREE.SphereGeometry(1, lite ? 16 : 36, lite ? 10 : 22);
  const p = shell.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.x = Math.sign(v.x) * Math.pow(Math.abs(v.x), 0.75);
    v.z = Math.sign(v.z) * Math.pow(Math.abs(v.z), 0.8) * (v.z > 0 ? 0.9 : 1);
    v.y = v.y < 0 ? v.y * 0.35 : v.y * (1 - 0.25 * v.z * v.z);
    // The H-shaped groove crabs carry on their backs, faintly.
    if (v.y > 0) v.y -= 0.035 * Math.exp(-((v.x * v.x) / 0.02)) * Math.max(0, 0.6 - Math.abs(v.z));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const parts: Part[] = [[shell, SHELL]];
  // Eyes on short stalks at the front corners.
  for (const st of pair((s) => limb([[s * 0.42, 0.3, 0.76], [s * 0.47, 0.5, 0.88], [s * 0.5, 0.64, 0.95]], 0.075, 0.06))) parts.push([st, LIMB]);
  for (const e of pair((s) => ellipsoid(0.13, 0.13, 0.13, [s * 0.5, 0.7, 0.98], 14, 10))) parts.push([e, EYE]);
  // Claws, raised when threatened.
  for (const s of [1, -1] as const) parts.push(...chela(s, { kind: MOTION.claw, phase: 0, from: [s * 0.75, -0.05, 0.6], len: 1.6 }));
  // Four pairs of walking legs, splayed out sideways, each bent at the knee and tapering to
  // a point; neighbours and opposite sides alternate, as crabs do.
  for (let k = 0; k < 4; k++) {
    const z = 0.45 - k * 0.38;
    const reach = 1.85 - Math.abs(k - 1.5) * 0.18;
    for (const s of [1, -1] as const) {
      parts.push([limb([[s * 0.85, -0.1, z], [s * 1.35, 0.35, z - 0.05], [s * reach, 0.05, z - 0.12], [s * (reach + 0.25), GROUND + 0.04, z - 0.2]], 0.09, 0.028, 6), LIMB,
        { kind: MOTION.leg, phase: (k % 2) * Math.PI + (s > 0 ? 0 : Math.PI), from: [s * 0.85, -0.1, z], len: 1.4 }]);
    }
  }
  return build(parts);
}

/** A slender, segmented abdomen: a tapering body with a ring at every segment. */
function abdomen(): THREE.BufferGeometry {
  const rings: THREE.Vector2[] = [];
  const n = lite ? 10 : 28;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Fullest a third of the way back, drawn out to a point at the tip.
    const r = 0.42 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7) * (1 - 0.35 * t) * (1 - 0.06 * Math.pow(Math.abs(Math.sin(t * Math.PI * 7)), 4));
    rings.push(new THREE.Vector2(Math.max(0.002, r), -t * 1.7));
  }
  // Lathe around y, then lay it along -z behind the thorax.
  return new THREE.LatheGeometry(rings, lite ? 8 : 16).rotateX(Math.PI / 2).translate(0, -0.05, 0.1);
}

function gnat(): THREE.BufferGeometry {
  // A fungus gnat: humped thorax, a long thin abdomen, a small head with big eyes,
  // long beaded antennae and long dangling legs.
  const parts: Part[] = [
    [ellipsoid(0.56, 0.6, 0.62, [0, 0.12, 0.32]), SHELL],
    [abdomen(), SHELL],
    [ellipsoid(0.32, 0.32, 0.28, [0, 0.0, 0.98], 16, 12), SHELL],
  ];
  for (const e of pair((s) => ellipsoid(0.17, 0.22, 0.16, [s * 0.22, 0.04, 1.02], 12, 10))) parts.push([e, EYE]);
  for (const a of pair((s) => limb([[s * 0.1, 0.2, 1.2], [s * 0.22, 0.55, 1.55], [s * 0.3, 0.85, 1.8], [s * 0.34, 1.05, 2.05]], 0.05, 0.03))) parts.push([a, LIMB]);
  // Wings: long narrow ovals lying back over the abdomen, a little apart.
  for (const w of pair((s) => {
    const wing = new THREE.CircleGeometry(1, lite ? 12 : 28);
    const wp = wing.attributes.position as THREE.BufferAttribute;
    // Narrow at the base where it joins the thorax, broad and round toward the tip.
    for (let i = 0; i < wp.count; i++) {
      const y = wp.getY(i);
      wp.setX(i, wp.getX(i) * (0.32 + 0.12 * (y + 1)));
    }
    return wing.scale(0.9, 1.25, 1).rotateX(-Math.PI / 2).rotateY(s * 0.45).translate(s * 0.45, 0.5, -0.65);
  })) {
    parts.push([w, WING, { kind: MOTION.wing, phase: 0, from: [0, 0.5, 0], len: 1 }]);
  }
  for (let k = 0; k < 3; k++) {
    for (const leg of pair((s) => limb([[s * 0.28, -0.3, 0.5 - k * 0.22], [s * 0.85, -0.55, 0.55 - k * 0.42], [s * 1.15, -1.25, 0.45 - k * 0.6], [s * 1.25, -1.75, 0.4 - k * 0.7]], 0.05, 0.022, 4))) parts.push([leg, LIMB]);
  }
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
  /** Legs swing across the body rather than along it: crabs walk sideways. */
  sideways?: boolean;
}

/**
 * Moves the tagged parts on the GPU, from a per-animal `gait` attribute: (step phase,
 * how hard it is walking 0..1+, threat 0..1, clock). A mesh without it (a swatch) gets
 * WebGL's default (0, 0, 0, 1): standing still.
 */
function animate(m: THREE.Material, sideways: boolean) {
  m.defines = { ...m.defines, ...(sideways ? { STRIDE_X: '' } : {}) };
  m.customProgramCacheKey = () => `critter-motion-${sideways}`;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 motion;
attribute vec4 gait;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float w = motion.x;
  float kind = motion.z;
  float ph = gait.x + motion.y;
  if (kind > 0.5 && kind < 1.5) {
    // Leg: swings along the stride, lifting as it comes forward. Bodies are squashed
    // flat by their species' scale, so the lift is large here to read once scaled.
    float swing = sin(ph) * gait.y * w;
    #ifdef STRIDE_X
    transformed.x += 0.38 * swing;
    #else
    transformed.z += 0.38 * swing;
    #endif
    transformed.y += 0.45 * max(0.0, cos(ph)) * gait.y * w;
  } else if (kind > 1.5 && kind < 2.5) {
    // Antenna: feels about, more busily on the move.
    transformed.x += w * 0.18 * sin(gait.w * 2.3 + motion.y) * (0.4 + 0.6 * gait.y);
    transformed.y += w * 0.08 * sin(gait.w * 3.1 + motion.y);
  } else if (kind > 2.5 && kind < 3.5) {
    // Claw: swung up from the shoulder when threatened, as vampire crabs do. A rigid turn
    // about the joint (where crab() puts it), so the arm keeps its length.
    vec3 joint = vec3(sign(transformed.x) * 0.75, -0.05, 0.6);
    float a = 1.1 * gait.z;
    vec3 d = transformed - joint;
    transformed = joint + vec3(d.x, d.y * cos(a) + d.z * sin(a), d.z * cos(a) - d.y * sin(a));
  } else if (kind > 3.5) {
    // Wing: a fast flap.
    transformed.y += w * 0.45 * sin(gait.w * 70.0);
  }
}`);
  };
}

/** The materials for one species, in group order: shell, legs, accent, wings, eyes. */
export function critterMaterials(c: CritterColors): THREE.Material[] {
  const shell = new THREE.MeshStandardMaterial({ color: c.shell, roughness: c.rough, map: c.map ?? null });
  const limb = new THREE.MeshStandardMaterial({ color: c.limb, roughness: 0.6 });
  const accent = c.accent ? new THREE.MeshStandardMaterial({ color: c.accent, roughness: 0.35 }) : shell;
  const wing = new THREE.MeshStandardMaterial({ color: '#d8dde0', roughness: 0.2, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const eye = new THREE.MeshStandardMaterial({ color: c.eye ?? '#151515', roughness: 0.2 });
  for (const m of new Set([limb, accent, wing])) animate(m, !!c.sideways);
  return [shell, limb, accent, wing, eye];
}
