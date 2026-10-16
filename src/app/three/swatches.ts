import * as THREE from 'three';
import { RoomEnvironment } from 'three-stdlib';
import type { DrainageId, HardscapeId, LidId, MoistureId, PlacementId, SubstrateId, VesselId } from '../../engine/index.js';
import { LOOKS } from './Critters.js';
import { critterGeometry, critterMaterials } from './critterModels.js';
import { fbm } from './noise.js';
import { BUILDERS, leafLitterGeometry, PLANT_COLORS, taperedTube } from './plants.js';
import { barkTexture, corkTexture, lumpTexture, shellTexture, soilTexture } from './textures.js';
import { glassGeometry, SHAPES } from './vessel.js';

/**
 * Small round previews of the materials and things you choose in the builder,
 * rendered with the same textures and models as the jar itself. One offscreen
 * renderer draws them one at a time, and each is kept as an image.
 *
 * Keys look like "substrate:peat", "plant:fittonia", "crew:dairy-cow-isopod".
 */

const SIZE = 128;
let rig: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; key: THREE.DirectionalLight; fill: THREE.HemisphereLight } | null = null;

function setup() {
  if (rig) return rig;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
  camera.position.set(0, 0.9, 4);
  camera.lookAt(0, 0, 0);
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(-2, 3, 2.5);
  const fill = new THREE.HemisphereLight('#f4f7ff', '#6b5b48', 0.6);
  scene.add(key, fill);
  rig = { renderer, scene, camera, key, fill };
  return rig;
}

const ball = (mat: THREE.Material) => new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat);
const soilDisc = (id: SubstrateId = 'bioactive') => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.05, 0.25, 48), new THREE.MeshStandardMaterial({ map: soilTexture(id), roughness: 0.95 }));
  m.position.y = -0.125;
  return m;
};

function substrate(id: SubstrateId) {
  const map = soilTexture(id);
  return ball(new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 3, roughness: 0.95, color: new THREE.Color(1.25, 1.25, 1.25) }));
}

/** The same soil, dry, damp and wet: wet soil is darker and shines. */
function moisture(id: MoistureId) {
  const map = soilTexture('bioactive');
  const look = { dry: [1.6, 0.98, 0], damp: [1.05, 0.8, 0.1], wet: [0.6, 0.3, 0.8] }[id] as [number, number, number];
  return ball(new THREE.MeshPhysicalMaterial({ map, bumpMap: map, bumpScale: 2, color: new THREE.Color(look[0], look[0], look[0]), roughness: look[1], clearcoat: look[2], clearcoatRoughness: 0.2 }));
}

function drainage(id: DrainageId) {
  const g = new THREE.Group();
  if (id === 'none') return g;
  const leca = id === 'leca';
  const geo = leca ? new THREE.SphereGeometry(1, 24, 16) : new THREE.DodecahedronGeometry(1, 1);
  const colors = leca ? ['#a5633a', '#b46f42', '#93552f'] : ['#8d918c', '#7b7f7a', '#a4a69f'];
  const spots: [number, number, number, number][] = [[0, 0.1, 0.1, 0.5], [-0.55, -0.15, 0.2, 0.42], [0.55, -0.12, 0.15, 0.45], [-0.15, -0.35, 0.55, 0.38], [0.3, 0.45, -0.3, 0.36], [-0.45, 0.4, -0.2, 0.34]];
  spots.forEach(([x, y, z, r], i) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: leca ? 0.95 : 0.7, bumpMap: lumpTexture(), bumpScale: 3 }));
    m.position.set(x, y, z);
    m.scale.set(r, r * (leca ? 0.95 : 0.75), r);
    m.rotation.set(i, i * 2, 0);
    g.add(m);
  });
  return g;
}

function hardscape(id: HardscapeId) {
  if (id === 'stone') {
    const geo = new THREE.IcosahedronGeometry(1, 4);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.multiplyScalar(0.8 + 0.45 * fbm(v.x * 1.6 + 4, v.y * 1.6 + v.z * 1.3, 21, 4));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#8e938c', roughness: 0.82, bumpMap: lumpTexture(), bumpScale: 5 }));
    m.scale.set(1.15, 0.8, 0.95);
    return m;
  }
  if (id === 'wood') {
    const map = barkTexture().clone();
    map.repeat.set(2, 1);
    map.needsUpdate = true;
    const pts = [new THREE.Vector3(-1.2, -0.4, 0.2), new THREE.Vector3(-0.3, 0, 0), new THREE.Vector3(0.5, 0.25, -0.1), new THREE.Vector3(1.2, 0.6, -0.2)];
    return new THREE.Mesh(taperedTube(pts, 0.4, 0.18, 24, 14), new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 4, roughness: 0.85 }));
  }
  const g = new THREE.Group();
  const palette = ['#8a5a2b', '#a0703a', '#6f4a26', '#b0864e', '#7c5a3a'];
  const geo = leafLitterGeometry();
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: palette[i % palette.length], roughness: 0.8, side: THREE.DoubleSide }));
    m.position.set(Math.sin(i * 2.4) * 0.05 * i * 0.4, i * 0.004, Math.cos(i * 2.4) * 0.05 * i * 0.4);
    m.rotation.set(Math.PI / 2 - 0.2 + (i % 3) * 0.15, i * 1.3, 0, 'YXZ');
    m.scale.setScalar(9);
    g.add(m);
  }
  return g;
}

const glassMat = () => new THREE.MeshPhysicalMaterial({
  color: '#cfe3e8', metalness: 0, roughness: 0.04, transparent: true, opacity: 0.38, clearcoat: 1, clearcoatRoughness: 0.03,
  envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false,
});

/** The vessel's own outline in glass, with a band of soil inside. */
function vessel(id: VesselId) {
  const g = new THREE.Group();
  const shape = SHAPES[id];
  g.add(new THREE.Mesh(glassGeometry(shape), glassMat()));
  const soil = shape.kind === 'round'
    ? new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.45, 48), new THREE.MeshStandardMaterial({ map: soilTexture('bioactive'), roughness: 0.95, color: new THREE.Color(1.4, 1.4, 1.4) }))
    : new THREE.Mesh(new THREE.BoxGeometry(shape.hx * 1.9, 0.45, shape.hz * 1.9), new THREE.MeshStandardMaterial({ map: soilTexture('bioactive'), roughness: 0.95, color: new THREE.Color(1.4, 1.4, 1.4) }));
  soil.position.y = 0.3;
  if (id === 'bottle' || id === 'bowl') soil.scale.set(1.1, 1, 1.1);
  g.add(soil);
  // The outline the eye uses to read glass: edges for boxes, the silhouette rim for round vessels.
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(glassGeometry(shape), shape.kind === 'round' ? 60 : 20), new THREE.LineBasicMaterial({ color: id === 'wardian' ? '#2c3b33' : '#7f9c96' }));
  g.add(edges);
  return g;
}

function lid(id: LidId) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.07, 16, 64), glassMat());
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.2;
  g.add(ring);
  if (id === 'open') return g;
  if (id === 'cork') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.74, 0.55, 48), new THREE.MeshStandardMaterial({ map: corkTexture(), bumpMap: corkTexture(), bumpScale: 3, roughness: 0.9 }));
    m.position.y = 0.05;
    g.add(m);
    return g;
  }
  const disc = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.1, 64), glassMat());
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), glassMat());
  knob.position.y = 0.22;
  disc.add(top, knob);
  disc.position.y = id === 'cracked' ? 0.12 : -0.08;
  if (id === 'cracked') {
    disc.rotation.z = -0.28;
    disc.position.x = 0.15;
  }
  g.add(disc);
  return g;
}

function plant(id: string) {
  const build = BUILDERS[id];
  const g = new THREE.Group();
  if (!build) return g;
  const c = PLANT_COLORS[id] ?? { leaf: '#4c7a37', accent: '#3a5f2a' };
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const parts = build({
    s: 0.6, turgor: 1, health: 1, dry: 0, rng,
    leaf: new THREE.Color(c.leaf), accent: new THREE.Color(c.accent),
    groundAt: () => 0, wallDist: () => (id === 'creeping-fig' ? 0.18 : 9), ceiling: 0.3,
  });
  for (const p of parts) {
    if (p.instances) {
      const m = new THREE.InstancedMesh(p.geometry, p.material, p.instances.length);
      p.instances.forEach((it, i) => {
        m.setMatrixAt(i, it.matrix);
        m.setColorAt(i, it.color);
      });
      g.add(m);
    } else g.add(new THREE.Mesh(p.geometry, p.material));
  }
  return g;
}

function crew(id: string) {
  const look = LOOKS[id];
  const g = new THREE.Group();
  if (!look) return g;
  const geo = critterGeometry(look.body);
  const mats = critterMaterials({ shell: look.color, limb: look.limb, accent: look.accent, eye: look.eye, rough: look.rough, map: look.shell ? shellTexture(look.shell) : null });
  // Several for the tiny ones, so they read as a colony.
  const spots: [number, number][] = look.motion === 'hop' ? [[0, 0], [-0.45, 0.25], [0.4, -0.25], [0.1, 0.5]] : [[0, 0]];
  // Sized by the body with its legs and antennae, about twice the shell.
  const k = (spots.length > 1 ? 0.3 : 0.55) / Math.max(...look.scale);
  for (const [x, z] of spots) {
    const m = new THREE.Mesh(geo, mats);
    m.scale.set(look.scale[0] * k, look.scale[1] * k, look.scale[2] * k);
    m.position.set(x, m.scale.y * 0.7, z);
    m.rotation.y = 0.6 + x;
    g.add(m);
  }
  const disc = soilDisc();
  disc.scale.set(0.95, 0.6, 0.95);
  g.add(disc);
  return g;
}

/** A clay ball under each placement's light, against its sky or room. */
const LIGHTS: Record<PlacementId, { color: string; intensity: number; from: [number, number, number]; back: string; fill: number }> = {
  'dim-corner': { color: '#e8dccb', intensity: 0.6, from: [2, 2, 2], back: '#4b4a52', fill: 0.25 },
  'north-window': { color: '#dfe9ff', intensity: 1.8, from: [-3, 1.5, 2], back: '#cfe0f0', fill: 0.7 },
  'east-window': { color: '#ffd8a8', intensity: 2.4, from: [-3, 0.6, 2], back: '#f7e6c8', fill: 0.55 },
  'grow-light': { color: '#f6e2ff', intensity: 2.6, from: [0, 4, 1], back: '#e7dcef', fill: 0.5 },
  'south-window': { color: '#fff1c4', intensity: 4.5, from: [-2, 3, 2], back: '#fff1cc', fill: 0.8 },
};

function placement(id: PlacementId) {
  const g = new THREE.Group();
  const l = LIGHTS[id];
  const back = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshBasicMaterial({ color: l.back, toneMapped: false }));
  back.position.z = -2;
  const clay = ball(new THREE.MeshStandardMaterial({ color: '#f1ece4', roughness: 0.85 }));
  clay.scale.setScalar(0.9);
  g.add(back, clay);
  g.userData.light = l;
  return g;
}

function build(key: string): THREE.Object3D | null {
  const [kind, id = ''] = key.split(':');
  switch (kind) {
    case 'substrate': return substrate(id as SubstrateId);
    case 'moisture': return moisture(id as MoistureId);
    case 'drainage': return id === 'none' ? null : drainage(id as DrainageId);
    case 'hardscape': return hardscape(id as HardscapeId);
    case 'vessel': return vessel(id as VesselId);
    case 'lid': return lid(id as LidId);
    case 'plant': return plant(id);
    case 'crew': return crew(id);
    case 'placement': return placement(id as PlacementId);
    default: return null;
  }
}

/** Centre the object and scale it to fill the circle. */
function frame(obj: THREE.Object3D, kind: string) {
  if (kind === 'placement') return;
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const fill = kind === 'vessel' || kind === 'lid' ? 1.55 : kind === 'plant' || kind === 'crew' ? 1.7 : 1.45;
  const s = fill / Math.max(size.x, size.y, size.z * 0.8);
  obj.scale.multiplyScalar(s);
  obj.position.sub(center.multiplyScalar(s));
}

function draw(key: string): string | null {
  const obj = build(key);
  if (!obj) return null;
  const r = setup();
  const kind = key.split(':')[0]!;
  frame(obj, kind);
  const light = obj.userData.light as (typeof LIGHTS)[PlacementId] | undefined;
  r.key.color.set(light?.color ?? '#ffffff');
  r.key.intensity = light?.intensity ?? 2.2;
  r.key.position.set(...(light?.from ?? [-2, 3, 2.5]));
  r.fill.intensity = light?.fill ?? 0.6;
  r.scene.environmentIntensity = light ? 0.15 : 1;
  r.scene.add(obj);
  r.renderer.setClearColor(0x000000, 0);
  r.renderer.render(r.scene, r.camera);
  const url = r.renderer.domElement.toDataURL('image/png');
  r.scene.remove(obj);
  return url;
}

const done = new Map<string, string | null>();
const queue: { key: string; resolve: (v: string | null) => void }[] = [];
let running = false;

function pump() {
  if (running) return;
  running = true;
  const next = () => {
    const job = queue.shift();
    if (!job) {
      running = false;
      return;
    }
    let url: string | null = null;
    try {
      url = done.has(job.key) ? done.get(job.key)! : draw(job.key);
    } catch {
      url = null;
    }
    done.set(job.key, url);
    job.resolve(url);
    // One per frame keeps the page responsive while a row of swatches fills in.
    requestAnimationFrame(next);
  };
  requestAnimationFrame(next);
}

export function renderSwatch(key: string): Promise<string | null> {
  if (done.has(key)) return Promise.resolve(done.get(key)!);
  return new Promise((resolve) => {
    queue.push({ key, resolve });
    pump();
  });
}
