import { _roots, advance, createRoot, extend, flushSync, type ReconcilerRoot } from '@react-three/fiber';
import * as THREE from 'three';
import type { TerrariumSpec, TerrariumState } from '../../engine/index.js';
import { newMotion } from './rig.js';
import { JarScene } from './Terrarium3D.js';

/**
 * Still pictures of jars for the community shelf: the same 3D scene as the live
 * view, rendered once into an image instead of a canvas per card. One offscreen
 * renderer draws them one at a time; a page of two dozen jars costs one WebGL
 * context, not two dozen.
 */

const W = 300;
const H = 420;
const DPR = 1.5;

let canvas: HTMLCanvasElement | null = null;
let root: ReconcilerRoot<HTMLCanvasElement> | null = null;

function ensureRoot() {
  if (root && canvas) return { root, canvas };
  // <Canvas> registers three's classes for JSX when it mounts; a hand-made root has to do it itself.
  extend(THREE as unknown as Parameters<typeof extend>[0]);
  canvas = document.createElement('canvas');
  root = createRoot(canvas);
  root.configure({
    gl: { antialias: true, alpha: true, preserveDrawingBuffer: true, toneMappingExposure: 1.08 },
    size: { width: W, height: H, top: 0, left: 0 },
    dpr: DPR,
    shadows: true,
    frameloop: 'never',
    camera: { fov: 30, near: 0.1, far: 50, position: [0, 1.4, 5.2] },
  });
  return { root, canvas };
}

function draw(spec: TerrariumSpec, state: TerrariumState): string | null {
  const { root, canvas } = ensureRoot();
  flushSync(() => {
    root.render(
      <JarScene spec={spec} state={state} lively={false} wall="#ffffff" motion={newMotion()} autoRotate={false} view="front" focus="all" bare />,
    );
  });
  const rs = _roots.get(canvas)?.store.getState();
  if (!rs) return null;
  rs.gl.setClearColor(0x000000, 0);
  // A few frames: the first builds the environment light and shadows, the rest settle the camera.
  for (let i = 0; i < 4; i++) advance(performance.now() + i * 16, true, rs);
  return canvas.toDataURL('image/webp', 0.85);
}

const done = new Map<string, string | null>();
const queue: { key: string; spec: TerrariumSpec; state: TerrariumState; resolve: (v: string | null) => void }[] = [];
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
      url = done.has(job.key) ? done.get(job.key)! : draw(job.spec, job.state);
    } catch (e) {
      console.warn('Could not render a still', e);
      url = null;
    }
    done.set(job.key, url);
    job.resolve(url);
    // One per frame keeps scrolling smooth while a shelf fills in.
    requestAnimationFrame(next);
  };
  requestAnimationFrame(next);
}

/** A still of this jar, rendered once per key. Null when it could not be drawn. */
export function renderStill(key: string, spec: TerrariumSpec, state: TerrariumState): Promise<string | null> {
  if (done.has(key)) return Promise.resolve(done.get(key)!);
  return new Promise((resolve) => {
    queue.push({ key, spec, state, resolve });
    pump();
  });
}
