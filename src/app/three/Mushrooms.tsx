import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { isTap, nudge, useMotion } from './rig.js';
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
  const { stems, caps, center } = useMemo(() => {
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
    const center = new THREE.Vector3();
    for (const c of caps) center.add(new THREE.Vector3().setFromMatrixPosition(c.m));
    if (caps.length) center.divideScalar(caps.length);
    center.y = L.gy;
    return { stems, caps, center };
  }, [L, amount, seed]);
  const stemMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), []);
  const capMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.45, sheen: 0.5, sheenColor: new THREE.Color('#f0dcc0'), side: THREE.DoubleSide }), []);

  // Tapped, the caps bob and let go a puff of spores that drifts up and fades.
  const motion = useMotion();
  const group = useRef<THREE.Group>(null);
  const bob = useRef({ y: 0, v: 0 });
  const puff = useMemo(() => new Spores(), []);
  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30);
    const b = bob.current;
    b.v += (-220 * b.y - 10 * b.v) * dt;
    b.y += b.v * dt;
    group.current?.scale.set(1 + b.y * 0.4, 1 - b.y, 1 + b.y * 0.4);
    puff.step(dt);
  });
  const tap = (e: ThreeEvent<MouseEvent>) => {
    if (!isTap(e)) return;
    e.stopPropagation();
    bob.current.v += 2.5;
    puff.burst(puff.points.parent ? puff.points.parent.worldToLocal(e.point.clone()) : e.point.clone());
    nudge(motion, 0.2);
  };
  if (!caps.length) return null;
  return (
    <>
      {/* Pivot the bob on the middle of the cluster so the caps squash in place. */}
      <group ref={group} position={center} userData={{ interactive: true }} onClick={tap}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = ''; }}>
        <group position={center.clone().negate()}>
          <InstancedParts geometry={STEM} material={stemMat} items={stems} />
          <InstancedParts geometry={CAP} material={capMat} items={caps} />
        </group>
      </group>
      <primitive object={puff.points} />
    </>
  );
}

/** A small cloud of spores: points that rise, spread and fade over a second and a half. */
class Spores {
  readonly n = 60;
  readonly points: THREE.Points;
  private pos = new Float32Array(this.n * 3);
  private vel = new Float32Array(this.n * 3);
  private age = 99;
  private mat = new THREE.PointsMaterial({ color: '#d8c3a0', size: 0.012, transparent: true, opacity: 0, depthWrite: false });
  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.raycast = () => undefined;
  }
  burst(at: THREE.Vector3) {
    for (let i = 0; i < this.n; i++) {
      this.pos.set([at.x, at.y + 0.02, at.z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.12;
      this.vel.set([Math.cos(a) * r, 0.08 + Math.random() * 0.14, Math.sin(a) * r], i * 3);
    }
    this.age = 0;
  }
  step(dt: number) {
    if (this.age > 1.6) {
      this.mat.opacity = 0;
      return;
    }
    this.age += dt;
    for (let i = 0; i < this.n * 3; i++) this.pos[i]! += this.vel[i]! * dt;
    for (let i = 0; i < this.n; i++) this.vel[i * 3 + 1]! *= 1 - dt * 0.8;
    this.points.geometry.attributes.position!.needsUpdate = true;
    this.mat.opacity = 0.85 * (1 - this.age / 1.6);
  }
}
