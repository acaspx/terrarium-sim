import { useMemo } from 'react';
import * as THREE from 'three';
import { makeRng } from '../../engine/core/math.js';
import { woodPath, type Layout } from './layout.js';
import { InstancedParts, type Item } from './parts.js';

const STEM = new THREE.CylinderGeometry(0.005, 0.008, 0.09, 8).translate(0, 0.045, 0);
const CAP = new THREE.LatheGeometry(
  [[0, -0.001], [0.026, 0.002], [0.034, 0.004], [0.032, 0.012], [0.022, 0.022], [0.01, 0.027], [0, 0.028]].map(([x, y]) => new THREE.Vector2(x, y)),
  20,
);
const CAP_COLORS = ['#b98d5c', '#a87a4a', '#c9a274', '#9c6f45'];

/** A flush of small brown mushrooms on the driftwood and the soil beside it. */
export function Mushrooms({ L, amount, seed }: { L: Layout; amount: number; seed: number }) {
  const { stems, caps } = useMemo(() => {
    const stems: Item[] = [];
    const caps: Item[] = [];
    const n = amount <= 0 ? 0 : Math.min(14, Math.ceil(amount * 30));
    const w = woodPath(L);
    const curve = new THREE.CatmullRomCurve3(w.trunk);
    const r = makeRng(seed + 77);
    const scale = (1.7 * L.k) / 2.8;
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      let pos: THREE.Vector3;
      if (r() < 0.7) {
        const t = 0.12 + r() * 0.5;
        const rad = w.r0 + (w.r1 - w.r0) * t;
        pos = curve.getPointAt(t).add(new THREE.Vector3((r() - 0.5) * rad, rad * 0.8, (r() - 0.5) * rad));
      } else {
        const x = w.trunk[0]!.x + 0.1 + r() * 0.25;
        const z = w.trunk[0]!.z + (r() - 0.5) * 0.25;
        pos = new THREE.Vector3(x, L.ground.heightAt(x, z), z);
      }
      const s = (0.7 + 0.6 * r()) * scale;
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.5, r() * 6, (r() - 0.5) * 0.5));
      stems.push({ m: new THREE.Matrix4().compose(pos, tilt, new THREE.Vector3(s, s * (0.8 + 0.4 * r()), s)), c: new THREE.Color('#efe6d6') });
      const top = pos.clone().add(up.clone().applyQuaternion(tilt).multiplyScalar(0.088 * s));
      caps.push({ m: new THREE.Matrix4().compose(top, tilt, new THREE.Vector3(s, s, s)), c: new THREE.Color(CAP_COLORS[Math.floor(r() * CAP_COLORS.length)]!) });
    }
    return { stems, caps };
  }, [L, amount, seed]);
  const stemMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), []);
  const capMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.45, sheen: 0.5, sheenColor: new THREE.Color('#f0dcc0'), side: THREE.DoubleSide }), []);
  return (
    <>
      <InstancedParts geometry={STEM} material={stemMat} items={stems} />
      <InstancedParts geometry={CAP} material={capMat} items={caps} />
    </>
  );
}
