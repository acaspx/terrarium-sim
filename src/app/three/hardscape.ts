import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng } from '../../engine/core/math.js';
import { taperedTube } from './plants.js';

const noiseFor = (seed: number) => new SimplexNoise({ random: makeRng(seed) });

/**
 * A stone about a unit across: rounded lumps with a few sharp edges, flat where it
 * beds into the soil, darker in its hollows and lighter on top, with a little moss
 * where water settles. Smooth-shaded: the vertices are shared, so light rolls over it.
 */
export function stoneGeometry(seed = 21): THREE.BufferGeometry {
  const n = noiseFor(seed);
  const base = new THREE.IcosahedronGeometry(1, 14);
  base.deleteAttribute('normal');
  base.deleteAttribute('uv');
  const g = mergeVertices(base);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const relief = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const lumps = 0.6 * n.noise3d(v.x * 1.1, v.y * 1.1, v.z * 1.1) + 0.25 * n.noise3d(v.x * 2.4, v.y * 2.4, v.z * 2.4) + 0.08 * n.noise3d(v.x * 6, v.y * 6, v.z * 6);
    // Ridged noise: a few crisp edges, as on a broken or water-worn stone.
    const ridge = Math.pow(1 - Math.abs(n.noise3d(v.x * 1.7 + 9, v.y * 1.7, v.z * 1.7)), 4);
    const d = 1 + 0.22 * lumps + 0.06 * ridge;
    relief[i] = lumps;
    v.multiplyScalar(d);
    // Flat beneath, where it sits in the soil.
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.15;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const stone = new THREE.Color('#8f928a');
  const warm = new THREE.Color('#8a7f6e');
  const moss = new THREE.Color('#566b3a');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const up = nor.getY(i);
    // Hollows darker, tops lighter, a warmer cast in patches.
    c.copy(stone).lerp(warm, 0.5 + 0.5 * n.noise3d(v.x * 0.8 + 3, v.y * 0.8, v.z * 0.8));
    c.multiplyScalar(0.72 + 0.35 * (relief[i]! + 0.5) + 0.12 * up);
    // Fine speckle, as in granite.
    c.multiplyScalar(0.92 + 0.16 * (n.noise3d(v.x * 22, v.y * 22, v.z * 22) * 0.5 + 0.5));
    // Moss on the upward faces, in patches.
    // Broken up with fine noise, so it reads as moss and lichen rather than paint.
    const patch = THREE.MathUtils.smoothstep(n.noise3d(v.x * 2.6 + 7, v.y * 2.6, v.z * 2.6), 0.2, 0.5);
    const fleck = 0.55 + 0.45 * n.noise3d(v.x * 14, v.y * 14, v.z * 14);
    const m = up > 0.55 ? patch * fleck * (up - 0.55) * 2 : 0;
    c.lerp(moss, Math.min(0.6, m));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * Driftwood: a tapered branch with bark furrows running along it and rounded,
 * weathered ends instead of open cuts.
 */
export function driftwoodGeometry(points: THREE.Vector3[], r0: number, r1: number, seed = 5): THREE.BufferGeometry {
  const n = noiseFor(seed);
  const tube = taperedTube(points, r0, r1, 56, 20);
  const p = tube.attributes.position as THREE.BufferAttribute;
  const nor = tube.attributes.normal as THREE.BufferAttribute;
  const uv = tube.attributes.uv as THREE.BufferAttribute;
  const shade = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = uv.getX(i);
    const a = uv.getY(i) * Math.PI * 2;
    const r = r0 + (r1 - r0) * t;
    // Furrows that wander along the length, plus fine grain and the odd knot.
    const wander = 1.6 * n.noise(t * 3, 0.5);
    const furrow = Math.pow(Math.abs(Math.sin(a * 6 + wander)), 0.6);
    const grain = n.noise(t * 40, a * 3);
    const knot = Math.max(0, n.noise(t * 6, Math.cos(a) * 1.5 + 4) - 0.55) * 1.6;
    const d = r * (0.1 * furrow - 0.06 + 0.03 * grain + 0.25 * knot);
    // Darker down in the furrows, paler on the worn ridges.
    const k = 0.62 + 0.45 * furrow + 0.06 * grain;
    shade.set([k, k, k], i * 3);
    p.setXYZ(i, p.getX(i) + nor.getX(i) * d, p.getY(i) + nor.getY(i) * d, p.getZ(i) + nor.getZ(i) * d);
  }
  tube.computeVertexNormals();
  tube.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  // Weathered ends: a rounded knob at each, slightly smaller than the branch there.
  const cap = (at: THREE.Vector3, r: number) => {
    const g = new THREE.SphereGeometry(r * 0.98, 16, 10).translate(at.x, at.y, at.z);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position!.count * 3).fill(0.8), 3));
    return g;
  };
  const parts = [tube, cap(points[0]!, r0), cap(points[points.length - 1]!, r1)].map((g) => (g.index ? g.toNonIndexed() : g));
  return mergeGeometries(parts)!;
}
