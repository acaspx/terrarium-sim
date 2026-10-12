import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { plantStatus } from '../format.js';
import { ContactShadows, Environment, Html, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { makeRng } from '../../engine/core/math.js';
import {
  autoLayout, geometry as jarGeometry, plantSpecies, PLANT_IDS, type TerrariumSpec, type TerrariumState,
} from '../../engine/index.js';
import { condensationMaterial, rimMaterial, WIPES } from './condensation.js';
import { disturb, interactiveHit, isTap, JarRig, newMotion, nudge, useMotion, type Motion } from './rig.js';
import { CameraRig, type Focus, type View } from './camera.js';
import { downgrade, useQuality, type Quality } from './quality.js';
import { Critters } from './Critters.js';
import { q, toUv, useLayout, woodPath, type Layout } from './layout.js';
import { Mushrooms } from './Mushrooms.js';
import { clamp, fbm, hashSeed } from './noise.js';
import { InstancedParts } from './parts.js';
import { BUILDERS, leafLitterGeometry, PLANT_COLORS, taperedTube, type Part } from './plants.js';
import { Room } from './Room.js';
import { barkTexture, corkTexture, lumpTexture, moldTexture, shelfTexture, soilTexture } from './textures.js';
import { distToWall, footprint, glassGeometry, insideFp, layerGeometry, pointIn, type Shape } from './vessel.js';

export interface Terrarium3DProps {
  spec: TerrariumSpec;
  state: TerrariumState;
  /** Springtails hop, isopods wander, gnats drift, drips run. */
  lively?: boolean;
  autoRotate?: boolean;
  className?: string;
  label?: string;
  /** When given, plants can be dragged across the soil; called with the plant id and its new u, v. */
  onArrange?: (plantId: string, at: [number, number]) => void;
  /** Straight-on portrait (default) or a raised, near-isometric corner view. */
  view?: View;
  /** Part of the jar to frame (iso view): the whole jar, its layers, the plants, the crew, or the room and its light. */
  focus?: Focus;
}

/**
 * The terrarium as a lit 3D scene. Like the SVG jar, every visible thing maps
 * to something simulated: the glass fogs and streams with condensation, wet
 * soil darkens and turns glossy, the reservoir fills, plants droop with turgor
 * and brown with health, the crew moves, mold spreads, and the lights follow
 * the photoperiod.
 */
export default function Terrarium3D({ spec, state, lively = true, autoRotate = false, className, label, onArrange, view = 'front', focus = 'all' }: Terrarium3DProps) {
  const bg = useCssColor('--bg');
  const quality = useQuality();
  // One per jar view, kept across re-renders: how the jar is being handled.
  const motion = useMemo(newMotion, []);
  return (
    <div className={`jar3d${onArrange ? ' arranging' : ''}${className ? ` ${className}` : ''}`} role="img" aria-label={label ?? spec.name} data-quality={quality}>
      {/* Keyed by quality: stepping down rebuilds the renderer without shadows and at a lower pixel density. */}
      <Canvas key={quality} shadows={quality === 'high'} dpr={quality === 'high' ? [1, 2] : [1, 1.5]}
        camera={{ position: [0, 1.4, 5.2], fov: 30, near: 0.1, far: 50 }} gl={{ antialias: true, toneMappingExposure: 1.08 }}>
        <color attach="background" args={[bg]} />
        <JarScene spec={spec} state={state} lively={lively} wall={bg} onArrange={onArrange} motion={motion} autoRotate={autoRotate} view={view} focus={focus} quality={quality} />
        {quality === 'high' && <FrameRateWatch />}
      </Canvas>
    </div>
  );
}

function useCssColor(name: string) {
  const read = () => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#e5ebe7';
  const [v, setV] = useState(read);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const f = () => setV(read());
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return v;
}

// ------------------------------------------------------------------ scene

/**
 * Everything inside the canvas: light, camera, the jar and its contents, and (unless
 * bare) the room and shelf around it. Bare scenes are for stills: just the jar and its
 * shadow on a transparent background, to sit on a page.
 */
export function JarScene({ spec, state, lively, wall, onArrange, motion, autoRotate, view, focus, bare = false, quality = 'high' }: {
  spec: TerrariumSpec; state: TerrariumState; lively: boolean; wall: string; onArrange?: Terrarium3DProps['onArrange'];
  motion: Motion; autoRotate: boolean; view: View; focus: Focus; bare?: boolean; quality?: Quality;
}) {
  const L = useLayout(spec);
  const cl = state.climate;
  const g = jarGeometry(state.container);
  const moisture = cl.moisture;
  const wet = clamp((moisture - 0.3) / 0.9);
  const dry = clamp((0.45 - moisture) / 0.25);
  const reservoir = g.reservoirCapacityG > 0 ? clamp(state.pools.reservoirWaterG / g.reservoirCapacityG) : 0;
  const visibleMold = 0.1 * state.container.substrateL;
  const mold = clamp(state.pools.moldG / (2 * visibleMold));
  const litter = spec.hardscape.includes('leaf-litter') ? clamp(state.pools.detritusG / (state.container.substrateL * 9)) : 0;
  const ppfd = state.container.light.ppfd;

  return (
    <>
      <CameraRig L={L} focus={focus} view={view} extraTop={spec.placement === 'grow-light' ? 0.45 : 0} />
      <Lights lightOn={cl.lightOn} ppfd={ppfd} placement={spec.placement} quality={quality} />
      {!bare && <Room placement={spec.placement} lightOn={cl.lightOn} wall={wall} top={L.shape.top} baseY={L.baseY} />}
      {!bare && <Shelf y={L.baseY} deep={view === 'iso'} />}
      <ContactShadows key={spec.vessel} position={[0, L.baseY + 0.002, 0]} scale={5} blur={2.6} far={1.2} opacity={0.45} resolution={quality === 'high' ? 512 : 256} frames={1} color="#1d1a14" />

      <JarRig motion={motion} autoRotate={autoRotate} radius={L.shape.kind === 'square' ? Math.max(L.shape.hx, L.shape.hz) : Math.max(...L.shape.profile.map(([r]) => r))}>
        <Layers L={L} spec={spec} wet={q(wet, 0.05)} reservoir={q(reservoir, 0.05)} waterlogged={state.waterloggedHours > 24} />
        <Hardscape L={L} spec={spec} />
        <Plants L={L} spec={spec} state={state} dry={q(dry, 0.1)} onArrange={onArrange} />
        <Mushrooms L={L} amount={q(state.pools.mushroomG ?? 0, 0.01)} seed={spec.seed} />
        <Litter L={L} amount={q(litter, 0.05)} seed={spec.seed} />
        <Mold L={L} amount={q(mold, 0.05)} />
        <Critters L={L} state={state} lively={lively} quality={quality} />
        <Vessel L={L} spec={spec} cond={cl.condensationIndex} night={!cl.lightOn} lively={lively} quality={quality} />
      </JarRig>
    </>
  );
}

// ------------------------------------------------------------------ light

function Lights({ lightOn, ppfd, placement, quality }: { lightOn: boolean; ppfd: number; placement: TerrariumSpec['placement']; quality: Quality }) {
  const key = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const scene = useThree((s) => s.scene);
  const grow = placement === 'grow-light';
  const dayColor = new THREE.Color(grow ? '#f6f0ff' : placement === 'north-window' ? '#e9f0ff' : '#fff2de');
  const night = new THREE.Color('#8fa6d8');
  const level = clamp(ppfd / 150, 0.15, 1.8);
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 3);
    if (key.current) {
      const target = lightOn ? 0.7 + 1.7 * level : 0.22;
      key.current.intensity += (target - key.current.intensity) * k;
      key.current.color.lerp(lightOn ? dayColor : night, k);
    }
    if (hemi.current) hemi.current.intensity += ((lightOn ? 0.55 : 0.08) - hemi.current.intensity) * k;
    const env = scene as THREE.Scene & { environmentIntensity?: number };
    if (env.environmentIntensity !== undefined) env.environmentIntensity += ((lightOn ? 1 : 0.22) - env.environmentIntensity) * k;
  });
  const pos: [number, number, number] = grow ? [0.4, 6, 0.8] : [-4, 3.6, 2.6];
  return (
    <>
      <hemisphereLight ref={hemi} args={['#dfe9ff', '#5d4b38', 0.5]} />
      <directionalLight
        ref={key} position={pos} intensity={1.6} castShadow
        shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} shadow-normalBias={0.02}
        shadow-camera-left={-2} shadow-camera-right={2} shadow-camera-top={2.5} shadow-camera-bottom={-1} shadow-camera-near={0.5} shadow-camera-far={14}
      />
      <Environment resolution={quality === 'high' ? 256 : 128} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 8, 1]} />
        <Lightformer form="rect" intensity={4} position={[-5, 2.2, 1.5]} rotation={[0, Math.PI / 2, 0]} scale={[2.4, 3.6, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[5, 1.5, -1]} rotation={[0, -Math.PI / 2, 0]} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={0.5} position={[0, 1, -6]} scale={[10, 3, 1]} color="#cfe0d6" />
      </Environment>
    </>
  );
}

/** The surface the jar stands on. Seen from a raised corner it needs more depth to read as a tabletop. */
function Shelf({ y, deep }: { y: number; deep: boolean }) {
  const mat = useMemo(() => {
    const map = shelfTexture().clone();
    map.repeat.set(1.4, 1);
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map, roughness: 0.62, metalness: 0 });
  }, []);
  return (
    <mesh position={[0, y - 0.07, deep ? 0.6 : 0.4]} receiveShadow material={mat}>
      <boxGeometry args={[deep ? 8 : 7, 0.14, deep ? 5 : 3.2]} />
    </mesh>
  );
}

// ------------------------------------------------------------------ glass

const GLASS_PROPS: THREE.MeshPhysicalMaterialParameters = {
  color: '#ffffff', transmission: 1, thickness: 0.06, ior: 1.5, roughness: 0.04, metalness: 0,
  clearcoat: 1, clearcoatRoughness: 0.03, attenuationColor: new THREE.Color('#e3f2ea'), attenuationDistance: 3,
  specularIntensity: 1, envMapIntensity: 1, side: THREE.DoubleSide, depthWrite: false,
};

/**
 * Light glass skips the transmission pass (a second render of everything behind the glass,
 * the scene's biggest cost) and is drawn as a thin, transparent, polished shell instead.
 * It loses the refraction and the blur of fogged glass, and keeps the reflections.
 */
const LIGHT_GLASS_PROPS: THREE.MeshPhysicalMaterialParameters = {
  // Both walls are drawn, so each is kept very faint; the reflections do the work of reading as glass.
  color: '#f4faf8', transmission: 0, transparent: true, opacity: 0.06, roughness: 0.03, metalness: 0,
  clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false,
};

function useGlass(quality: Quality) {
  return useMemo(() => new THREE.MeshPhysicalMaterial(quality === 'high' ? GLASS_PROPS : LIGHT_GLASS_PROPS), [quality]);
}

/**
 * Watches the frame rate for as long as the view is open, in windows of about two
 * seconds. If the typical frame in a window is slower than about 28 a second, the
 * device is struggling (now, or after it warms up, or as the jar fills in), so every
 * 3D view steps down to light quality.
 */
const WINDOW = 120;
function FrameRateWatch() {
  const samples = useRef<number[]>([]);
  const frame = useRef(0);
  useFrame((_, dt) => {
    if (document.visibilityState !== 'visible') return;
    frame.current += 1;
    // Skip the first second or so: shaders compiling and textures uploading are not the steady state.
    if (frame.current < 60) return;
    samples.current.push(dt);
    if (samples.current.length < WINDOW) return;
    const sorted = [...samples.current].sort((a, b) => a - b);
    samples.current = [];
    if (sorted[WINDOW / 2]! > 1 / 28) downgrade();
  });
  return null;
}

function Vessel({ L, spec, cond, night, lively, quality }: { L: Layout; spec: TerrariumSpec; cond: number; night: boolean; lively: boolean; quality: Quality }) {
  const { shape } = L;
  const glass = useGlass(quality);
  const geo = useMemo(() => glassGeometry(shape), [shape]);
  const film = useMemo(() => condensationMaterial(quality === 'high'), [quality]);
  const rim = useMemo(() => rimMaterial(), []);
  const filmMesh = useRef<THREE.Mesh>(null);
  const nextWipe = useRef(0);
  const openTop = spec.lid === 'open';
  const motion = useMotion();
  // A tap on the glass wipes a clear spot where the finger touched it.
  // Both walls the line of sight crosses are cleared, so you can actually see in.
  const wipe = (e: ThreeEvent<MouseEvent>) => {
    if (!isTap(e) || !filmMesh.current) return;
    // r3f reports one hit per object; cast again for where the line leaves through the far wall.
    const glassHits = new THREE.Raycaster(e.ray.origin, e.ray.direction).intersectObject(e.object, false).slice(0, 2);
    for (const h of glassHits) {
      const p = filmMesh.current.worldToLocal(h.point.clone());
      const slot = (film.uniforms.uWipes!.value as THREE.Vector4[])[nextWipe.current++ % WIPES]!;
      slot.set(p.x, p.y, p.z, film.uniforms.uClock!.value as number);
    }
    if (!e.intersections.slice(1).some((h) => interactiveHit(h.object))) nudge(motion, 0.4);
  };

  // Cube with an open top: hide the top face of the box.
  const materials = useMemo(() => {
    if (shape.kind !== 'square' || shape.roof) return glass;
    const none = new THREE.MeshBasicMaterial({ visible: false });
    return [glass, glass, none, glass, glass, glass];
  }, [shape, glass]);

  useFrame((s, dt) => {
    const k = 1 - Math.exp(-dt * 2);
    const u = film.uniforms;
    u.uCond!.value += (clamp(cond, 0, 1.6) - u.uCond!.value) * k;
    if (lively) u.uTime!.value += dt;
    u.uClock!.value += dt;
    u.uNight!.value += ((night ? 1 : 0) - u.uNight!.value) * k;
    // Fogged glass also blurs what is behind it.
    glass.roughness = 0.03 + 0.14 * clamp((u.uCond!.value - 0.3) / 0.9);
  });
  useEffect(() => {
    const u = film.uniforms;
    u.uGround!.value = L.gy;
    u.uTop!.value = shape.top;
    u.uSquare!.value = shape.kind === 'square' ? 1 : 0;
  }, [film, L.gy, shape]);

  const cracked = spec.lid === 'cracked';
  const clocheTilt = spec.vessel === 'cloche' && cracked;

  return (
    <group>
      <group position={clocheTilt ? [0, 0.05, 0] : [0, 0, 0]} rotation={clocheTilt ? [0, 0, -0.035] : [0, 0, 0]}>
        <mesh geometry={geo} material={materials} renderOrder={1} onClick={wipe} />
        <mesh ref={filmMesh} geometry={geo} material={film} scale={[0.985, 0.995, 0.985]} renderOrder={2} />
        {/* The rim light reads as a bright edge over refracting glass, but washes over plain transparent glass like a haze. */}
        {quality === 'high' && <mesh geometry={geo} material={rim} scale={1.003} renderOrder={3} raycast={() => null} />}
        {shape.kind === 'round' && !shape.openBottom && <Rim shape={shape} glass={glass} />}
        {spec.vessel === 'cloche' && <Knob y={shape.top + 0.05} glass={glass} />}
        {shape.kind === 'square' && <Frame shape={shape} wardian={spec.vessel === 'wardian'} />}
      </group>
      {!openTop && <Lid L={L} spec={spec} glass={glass} />}
      {spec.vessel === 'cloche' && (
        <mesh position={[0, -0.06, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.12, 1.15, 0.12, 64]} />
          <meshStandardMaterial map={barkTexture()} color="#9c7a58" roughness={0.6} />
        </mesh>
      )}
      {spec.vessel === 'wardian' && shape.kind === 'square' && (
        <mesh position={[0, -0.07, 0]} castShadow receiveShadow>
          <boxGeometry args={[shape.hx * 2 + 0.18, 0.14, shape.hz * 2 + 0.18]} />
          <meshStandardMaterial color="#2f4a3a" roughness={0.45} metalness={0.2} />
        </mesh>
      )}
    </group>
  );
}

function Rim({ shape, glass }: { shape: Extract<Shape, { kind: 'round' }>; glass: THREE.Material }) {
  const [r, y] = shape.profile[shape.profile.length - 1]!;
  return (
    <mesh position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={glass}>
      <torusGeometry args={[r, 0.022, 12, 96]} />
    </mesh>
  );
}

function Knob({ y, glass }: { y: number; glass: THREE.Material }) {
  return (
    <mesh position={[0, y, 0]} material={glass}>
      <sphereGeometry args={[0.08, 24, 16]} />
    </mesh>
  );
}

/** Metal glazing bars for the Wardian case; clear silicone seams for the cube. */
function Frame({ shape, wardian }: { shape: Extract<Shape, { kind: 'square' }>; wardian: boolean }) {
  const { geometry, count, matrices } = useMemo(() => {
    const edges = new THREE.EdgesGeometry(glassGeometry(shape), 20);
    const pos = edges.attributes.position as THREE.BufferAttribute;
    const segs: [THREE.Vector3, THREE.Vector3][] = [];
    for (let i = 0; i < pos.count; i += 2) {
      segs.push([new THREE.Vector3().fromBufferAttribute(pos, i), new THREE.Vector3().fromBufferAttribute(pos, i + 1)]);
    }
    if (wardian) {
      // Mullions: one down the middle of each long face, one across at mid-height.
      const { hx, hz, wallTop } = shape;
      for (const z of [-hz, hz]) {
        segs.push([new THREE.Vector3(0, 0, z), new THREE.Vector3(0, shape.top, z)]);
        segs.push([new THREE.Vector3(-hx, wallTop * 0.55, z), new THREE.Vector3(hx, wallTop * 0.55, z)]);
      }
      for (const x of [-hx, hx]) segs.push([new THREE.Vector3(x, wallTop * 0.55, -hz), new THREE.Vector3(x, wallTop * 0.55, hz)]);
    }
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 6);
    const up = new THREE.Vector3(0, 1, 0);
    const r = wardian ? 0.022 : 0.009;
    const matrices = segs.map(([a, b]) => {
      const dir = b.clone().sub(a);
      const len = dir.length();
      const qq = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
      return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), qq, new THREE.Vector3(r, len + r * 2, r));
    });
    return { geometry, count: matrices.length, matrices };
  }, [shape, wardian]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [matrices]);
  return (
    <instancedMesh key={count} ref={ref} args={[geometry, undefined, count]} castShadow>
      {wardian
        ? <meshStandardMaterial color="#2c3b33" roughness={0.38} metalness={0.75} />
        : <meshPhysicalMaterial color="#cfe3da" roughness={0.3} transparent opacity={0.55} />}
    </instancedMesh>
  );
}

function Lid({ L, spec, glass }: { L: Layout; spec: TerrariumSpec; glass: THREE.Material }) {
  const { shape } = L;
  const cracked = spec.lid === 'cracked';
  const corkMat = useMemo(() => new THREE.MeshStandardMaterial({ map: corkTexture(), bumpMap: corkTexture(), bumpScale: 2, roughness: 0.9 }), []);
  if (shape.kind === 'round') {
    const [r, top] = shape.profile[shape.profile.length - 1]!;
    if (spec.vessel === 'cloche') return null;
    if (spec.lid === 'cork' || spec.vessel === 'bottle') {
      const h = spec.vessel === 'bottle' ? 0.26 : 0.2;
      return (
        <mesh position={[0, top - h * 0.35 + (cracked ? 0.14 : 0), 0]} material={corkMat} castShadow>
          <cylinderGeometry args={[r * 1.02, r * 0.94, h, 48]} />
        </mesh>
      );
    }
    return (
      <group position={[cracked ? 0.06 : 0, top + 0.025 + (cracked ? 0.06 : 0), 0]} rotation={[0, 0, cracked ? -0.09 : 0]}>
        <mesh material={glass}>
          <cylinderGeometry args={[r + 0.06, r + 0.06, 0.05, 72]} />
        </mesh>
        {spec.vessel === 'jar' && (
          <mesh position={[0, 0.1, 0]} material={glass}>
            <sphereGeometry args={[0.09, 24, 16]} />
          </mesh>
        )}
      </group>
    );
  }
  if (!shape.roof) {
    return (
      <mesh position={[cracked ? 0.35 : 0, shape.wallTop + 0.018, 0]} material={glass}>
        <boxGeometry args={[shape.hx * 2 + 0.04, 0.03, shape.hz * 2 + 0.04]} />
      </mesh>
    );
  }
  // Wardian case: a small vent pane propped open on the roof.
  if (!cracked) return null;
  const slope = Math.atan2(shape.top - shape.wallTop, shape.hx);
  return (
    <mesh position={[shape.hx * 0.32, shape.wallTop + (shape.top - shape.wallTop) * 0.7 + 0.06, 0]} rotation={[0, 0, -slope + 0.25]} material={glass}>
      <boxGeometry args={[0.5, 0.02, 0.6]} />
    </mesh>
  );
}

// ------------------------------------------------------------------ layers

function Layers({ L, spec, wet, reservoir, waterlogged }: { L: Layout; spec: TerrariumSpec; wet: number; reservoir: number; waterlogged: boolean }) {
  const { shape, floorY, drainTop, gy } = L;
  const hasDrain = spec.drainage !== 'none';
  const soil = useMemo(() => {
    const map = soilTexture(spec.substrate);
    return new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 2.2, roughness: 0.95 });
  }, [spec.substrate]);
  const soilSide = useMemo(() => {
    const map = soilTexture(spec.substrate).clone();
    map.repeat.set(4, 0.8);
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
  }, [spec.substrate]);
  // Wet soil is darker and catches the light.
  useEffect(() => {
    // The profile against the glass faces sideways, away from an overhead light; room light
    // through the glass is what shows it in a real jar, so it is lifted to stand in for that.
    for (const [m, lift] of [[soil, 1], [soilSide, 2.6]] as const) {
      m.color.setScalar((1.25 - 0.55 * wet) * lift);
      m.roughness = 0.95 - 0.45 * wet;
    }
  }, [soil, soilSide, wet]);

  const subGeo = useMemo(() => layerGeometry(shape, drainTop, gy, 0.012), [shape, drainTop, gy]);
  const motion = useMotion();
  // Tapping the soil startles whatever lives near that spot.
  const tapSoil = (e: ThreeEvent<MouseEvent>) => {
    if (!isTap(e)) return;
    e.stopPropagation();
    const p = e.object.worldToLocal(e.point.clone());
    disturb(motion, p.x, p.z);
  };
  const barrierGeo = useMemo(() => layerGeometry(shape, drainTop - 0.006, drainTop + 0.006, 0.011), [shape, drainTop]);
  const waterGeo = useMemo(
    () => (hasDrain && reservoir > 0.02 ? layerGeometry(shape, floorY, floorY + (drainTop - floorY) * reservoir, 0.014) : null),
    [shape, floorY, drainTop, reservoir, hasDrain],
  );

  return (
    <group>
      {hasDrain && <Drainage shape={shape} y0={floorY} y1={drainTop} kind={spec.drainage as 'leca' | 'gravel'} />}
      {waterGeo && (
        <mesh geometry={waterGeo} renderOrder={1}>
          <meshPhysicalMaterial color="#4f8799" roughness={0.08} transparent opacity={0.42} depthWrite={false} />
        </mesh>
      )}
      {hasDrain && (
        <mesh geometry={barrierGeo}>
          <meshStandardMaterial color="#2c3430" roughness={0.8} />
        </mesh>
      )}
      <mesh geometry={subGeo} material={soilSide} receiveShadow />
      <mesh geometry={L.ground.geometry} material={soil} receiveShadow onClick={tapSoil} userData={{ interactive: true }} />
      {waterlogged && (
        <mesh geometry={L.ground.geometry} position={[0, 0.006, 0]} renderOrder={1}>
          <meshPhysicalMaterial color="#87b5c4" roughness={0.02} transparent opacity={0.28} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function Drainage({ shape, y0, y1, kind }: { shape: Shape; y0: number; y1: number; kind: 'leca' | 'gravel' }) {
  const { geometry, material, items } = useMemo(() => {
    const leca = kind === 'leca';
    const r0 = leca ? 0.055 : 0.042;
    const geometry = leca ? new THREE.SphereGeometry(1, 14, 10) : new THREE.DodecahedronGeometry(1, 0);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: leca ? 0.95 : 0.7, bumpMap: lumpTexture(), bumpScale: 2 });
    const rnd = makeRng(leca ? 11 : 12);
    const items: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const palette = leca ? ['#a5633a', '#b46f42', '#93552f', '#8a4e2b'] : ['#8d918c', '#7b7f7a', '#a4a69f', '#6e716d'];
    const step = r0 * 1.75;
    for (let y = y0 + r0 * 0.9; y < y1 - r0 * 0.3; y += step * 0.8) {
      const fp = footprint(shape, Math.max(0.01, y), r0 + 0.02);
      const ext = fp.kind === 'circle' ? fp.r : Math.max(fp.hx, fp.hz);
      for (let x = -ext; x <= ext; x += step) {
        for (let z = -ext; z <= ext; z += step) {
          const jx = x + (rnd() - 0.5) * step * 0.5;
          const jz = z + (rnd() - 0.5) * step * 0.5;
          if (!insideFp(fp, jx, jz)) continue;
          const s = r0 * (0.75 + 0.5 * rnd());
          const e = new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6);
          items.push({
            m: new THREE.Matrix4().compose(new THREE.Vector3(jx, y + (rnd() - 0.5) * r0 * 0.4, jz), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(s, s * (leca ? 0.92 : 0.8), s)),
            c: new THREE.Color(palette[Math.floor(rnd() * palette.length)]!),
          });
        }
      }
    }
    return { geometry, material, items };
  }, [shape, y0, y1, kind]);
  return <InstancedParts geometry={geometry} material={material} items={items} cast={false} />;
}

// ------------------------------------------------------------------ hardscape

function Hardscape({ L, spec }: { L: Layout; spec: TerrariumSpec }) {
  const { groundFp } = L;
  const R = groundFp.kind === 'circle' ? groundFp.r : Math.min(groundFp.hx, groundFp.hz) * 1.1;
  const wood = useMemo(() => {
    if (!spec.hardscape.includes('wood')) return null;
    const w = woodPath(L);
    const trunk = taperedTube(w.trunk, w.r0, w.r1, 32, 10);
    const branch = taperedTube(w.branch, 0.045, 0.014, 16, 8);
    const map = barkTexture().clone();
    map.repeat.set(3, 1);
    map.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 4, roughness: 0.88 });
    return { trunk, branch, mat };
  }, [spec.hardscape, L]);
  const stone = useMemo(() => {
    if (!spec.hardscape.includes('stone')) return null;
    const g = new THREE.IcosahedronGeometry(1, 4);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = fbm(v.x * 1.6 + 4, v.y * 1.6 + v.z * 1.3, 21, 4);
      v.multiplyScalar(0.8 + 0.45 * n);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: '#8e938c', roughness: 0.82, bumpMap: lumpTexture(), bumpScale: 5 });
    const s = 0.24 * Math.min(1, R);
    const [x, z] = pointIn(groundFp, 0.55, 0.05);
    return { g, mat, s, x, z, y: L.ground.heightAt(x, z) };
  }, [spec.hardscape, groundFp, R, L.ground]);

  return (
    <group>
      {wood && (
        <>
          <mesh geometry={wood.trunk} material={wood.mat} castShadow receiveShadow />
          <mesh geometry={wood.branch} material={wood.mat} castShadow receiveShadow />
        </>
      )}
      {stone && (
        <mesh geometry={stone.g} material={stone.mat} position={[stone.x, stone.y + stone.s * 0.15, stone.z]} scale={[stone.s * 1.15, stone.s * 0.72, stone.s * 0.95]} rotation={[0.1, 0.6, 0]} castShadow receiveShadow />
      )}
    </group>
  );
}

// ------------------------------------------------------------------ plants

const PLANT_MAX: Record<string, number> = Object.fromEntries(PLANT_IDS.map((id) => [id, plantSpecies(id).maxBiomassG]));

function Plants({ L, spec, state, dry, onArrange }: {
  L: Layout; spec: TerrariumSpec; state: TerrariumState; dry: number; onArrange?: Terrarium3DProps['onArrange'];
}) {
  // Positions come from the simulation; jars saved before plants had one get the automatic layout.
  const ids = state.plants.map((p) => `${p.id}@${p.at?.join(',') ?? ''}`).join('|');
  const places = useMemo(() => {
    const auto = autoLayout(state.plants, spec.seed);
    return new Map(state.plants.map((pl, i) => [pl.id, pointIn(L.groundFp, ...(pl.at ?? auto[i]!))]));
    // Placement depends only on which plants exist and where, not on how they are doing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, L.groundFp, spec.seed]);

  const motion = useMotion();
  const [drag, setDrag] = useState<{ id: string; x: number; z: number } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    if (!picked) return;
    const t = setTimeout(() => setPicked(null), 4500);
    return () => clearTimeout(t);
  }, [picked]);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -L.gy), [L.gy]);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const group = useRef<THREE.Group>(null);
  const follow = (e: ThreeEvent<PointerEvent>) => {
    if (!group.current) return null;
    // The ray is in world space; the floor plane is in the jar's own (spun, rocked) space.
    const local = e.ray.clone().applyMatrix4(group.current.matrixWorld.clone().invert());
    if (!local.intersectPlane(plane, hit)) return null;
    const [x, z] = pointIn(L.groundFp, ...toUv(L.groundFp, hit.x, hit.z));
    return { x, z };
  };
  const dragHandlers = (id: string): Handlers | undefined => onArrange && {
    onPointerDown: (e) => {
      e.stopPropagation();
      (e.target as unknown as Element).setPointerCapture(e.pointerId);
      motion.locked = true;
      const [x, z] = places.get(id) ?? [0, 0];
      setDrag({ id, x, z });
    },
    onPointerMove: (e) => {
      if (drag?.id !== id) return;
      const p = follow(e);
      if (p) setDrag({ id, ...p });
    },
    onPointerUp: (e) => {
      (e.target as unknown as Element).releasePointerCapture(e.pointerId);
      motion.locked = false;
      if (drag?.id === id) {
        const [x0, z0] = places.get(id) ?? [0, 0];
        if (Math.hypot(drag.x - x0, drag.z - z0) > 0.02) onArrange(id, toUv(L.groundFp, drag.x, drag.z));
      }
      setDrag(null);
    },
  };

  return (
    <group ref={group}>
      {state.plants.map((pl) => {
        const [x, z] = places.get(pl.id) ?? [0, 0];
        const live = drag?.id === pl.id ? drag : null;
        const s = q(Math.sqrt(clamp(pl.biomassG / (PLANT_MAX[pl.speciesId] ?? 1))), 0.025);
        return (
          <Plant
            key={pl.id} id={pl.id} speciesId={pl.speciesId} L={L} x={x} z={z} dry={dry} live={live}
            s={s} turgor={q(pl.turgor, 0.05)} health={q(pl.health, 0.05)}
            handlers={dragHandlers(pl.id)} onTap={() => setPicked(pl.id)}
          />
        );
      })}
      {drag && (
        <mesh position={[drag.x, L.ground.heightAt(drag.x, drag.z) + 0.01, drag.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.13, 0.16, 40]} />
          <meshBasicMaterial color="#8cc497" transparent opacity={0.85} depthWrite={false} />
        </mesh>
      )}
      {picked && !drag && (() => {
        const pl = state.plants.find((p) => p.id === picked);
        const at = places.get(picked);
        if (!pl || !at) return null;
        const sp = plantSpecies(pl.speciesId);
        const st = plantStatus(pl);
        const top = L.ground.heightAt(at[0], at[1]) + (0.08 + 0.22 * Math.sqrt(clamp(pl.biomassG / sp.maxBiomassG))) * L.k;
        return (
          <Html position={[at[0], top, at[1]]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div className="jar-chip" role="status">
              <strong>{sp.commonName}</strong>
              <span className={`tone-${st.tone}`}>{st.word}, health {Math.round(pl.health * 100)}%</span>
              {(pl.shade ?? 0) >= 0.2 && <span>In shade, {Math.round(pl.shade! * 100)}% of its light lost</span>}
            </div>
          </Html>
        );
      })()}
    </group>
  );
}

type Handlers = Partial<Record<'onPointerDown' | 'onPointerMove' | 'onPointerUp', (e: ThreeEvent<PointerEvent>) => void>>;
const HIT = new THREE.CylinderGeometry(0.07, 0.07, 0.12, 12).translate(0, 0.06, 0);
const HIT_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

function Plant({ id, speciesId, L, x, z, s, turgor, health, dry, live, handlers, onTap }: {
  id: string; speciesId: string; L: Layout; x: number; z: number; s: number; turgor: number; health: number; dry: number;
  /** Where it is while being dragged; the plant is rebuilt for its new spot only once dropped. */
  live: { x: number; z: number } | null;
  handlers?: Handlers;
  onTap: () => void;
}) {
  const y = L.ground.heightAt(x, z);
  const parts = useMemo<Part[]>(() => {
    const build = BUILDERS[speciesId];
    if (!build) return [];
    const c = PLANT_COLORS[speciesId] ?? { leaf: '#4c7a37', accent: '#3a5f2a' };
    const k = L.k;
    return build({
      s, turgor, health, dry,
      rng: makeRng(hashSeed(id)),
      leaf: new THREE.Color(c.leaf), accent: new THREE.Color(c.accent),
      groundAt: (lx, lz) => (L.ground.heightAt(x + lx * k, z + lz * k) - y) / k,
      wallDist: (dx, dz, ly) => {
        const wy = y + ly * k;
        const fp = footprint(L.shape, wy, 0.03);
        return distToWall(fp, x, z, dx, dz) / k;
      },
      ceiling: ((L.shape.kind === 'square' ? L.shape.wallTop : L.shape.top - 0.25) - 0.08 - y) / k,
    });
  }, [speciesId, id, s, turgor, health, dry, L, x, z, y]);
  useEffect(() => () => {
    for (const p of parts) {
      if (!p.owned) continue;
      p.geometry.dispose();
      if (!(p.material as THREE.MeshStandardMaterial).map) p.material.dispose();
    }
  }, [parts]);

  // Sway: each plant lags behind the jar's rocking on a spring of its own,
  // looser for tall, soft plants. A tap squashes and springs it back up.
  const motion = useMotion();
  const sway = useRef<THREE.Group>(null);
  const spring = useRef({ lx: 0, lz: 0, vx: 0, vz: 0, sq: 0, sqv: 0, phase: hashSeed(id) % 7 });
  const loose = speciesId.includes('fern') ? 1.4 : speciesId.includes('moss') ? 0.4 : 1;
  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30);
    const sp = spring.current;
    const tx = -motion.tiltXVel * 0.05 * loose;
    const tz = -motion.tiltZVel * 0.05 * loose;
    const k = 40 / loose;
    sp.vx += (k * (tx - sp.lx) - 4 * sp.vx) * dt;
    sp.vz += (k * (tz - sp.lz) - 4 * sp.vz) * dt;
    sp.lx += sp.vx * dt;
    sp.lz += sp.vz * dt;
    sp.sqv += (-180 * sp.sq - 9 * sp.sqv) * dt;
    sp.sq += sp.sqv * dt;
    const g = sway.current;
    if (g) {
      g.rotation.set(sp.lx, 0, sp.lz);
      g.scale.set(1 + sp.sq * 0.5, 1 - sp.sq, 1 + sp.sq * 0.5);
    }
  });
  const tap = (e: ThreeEvent<MouseEvent>) => {
    if (!isTap(e)) return;
    e.stopPropagation();
    spring.current.sqv += 3.2;
    spring.current.vz += (spring.current.phase % 2 ? 1 : -1) * 1.5;
    onTap();
  };

  const at = live ?? { x, z };
  return (
    <group position={[at.x, live ? L.ground.heightAt(live.x, live.z) + 0.02 : y, at.z]} scale={L.k}
      userData={{ interactive: true }} onClick={tap}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = handlers ? 'grab' : 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = ''; }}
      {...handlers}>
      <group ref={sway}>
        {parts.map((p, i) =>
          p.instances
            ? <InstancedParts key={i} geometry={p.geometry} material={p.material} items={p.instances.map((it) => ({ m: it.matrix, c: it.color }))} />
            : <mesh key={i} geometry={p.geometry} material={p.material} castShadow receiveShadow />,
        )}
      </group>
      <mesh geometry={HIT} material={HIT_MAT} />
    </group>
  );
}

// ------------------------------------------------------------------ litter and mold

function Litter({ L, amount, seed }: { L: Layout; amount: number; seed: number }) {
  const items = useMemo(() => {
    const r = makeRng(seed + 404);
    const n = Math.round(amount * 46);
    const palette = ['#8a5a2b', '#a0703a', '#6f4a26', '#b0864e', '#7c5a3a'];
    return Array.from({ length: n }, () => {
      const [x, z] = pointIn(L.groundFp, r() * 2 - 1, r() * 2 - 1);
      const e = new THREE.Euler(Math.PI / 2 - 0.15 + r() * 0.3, r() * Math.PI * 2, (r() - 0.5) * 0.4, 'YXZ');
      const s = 0.8 + r() * 0.8;
      return {
        m: new THREE.Matrix4().compose(new THREE.Vector3(x, L.ground.heightAt(x, z) + 0.004, z), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(s, s, s)),
        c: new THREE.Color(palette[Math.floor(r() * palette.length)]!),
      };
    });
  }, [L, amount, seed]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }), []);
  return <InstancedParts geometry={leafLitterGeometry()} material={mat} items={items} />;
}

function Mold({ L, amount }: { L: Layout; amount: number }) {
  const { items, mat } = useMemo(() => {
    const r = makeRng(9);
    const n = amount > 0.05 ? Math.ceil(amount * 9) : 0;
    const items = Array.from({ length: n }, () => {
      const [x, z] = pointIn(L.groundFp, r() * 2 - 1, r() * 2 - 1);
      const s = 0.08 + r() * 0.22 * (0.4 + amount);
      return {
        m: new THREE.Matrix4().compose(
          new THREE.Vector3(x, L.ground.heightAt(x, z) + 0.008, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, r() * 6)),
          new THREE.Vector3(s, s, s),
        ),
        c: new THREE.Color('#ffffff'),
      };
    });
    const mat = new THREE.MeshStandardMaterial({ map: moldTexture(), transparent: true, depthWrite: false, opacity: 0.55 + 0.45 * amount, roughness: 1 });
    return { items, mat };
  }, [L, amount]);
  return <InstancedParts geometry={PLANE} material={mat} items={items} cast={false} />;
}
const PLANE = new THREE.PlaneGeometry(1, 1);

