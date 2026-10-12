import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Layout } from './layout.js';

/** What the camera is looking at. The builder follows the step you are on. */
export type Focus = 'all' | 'layers' | 'plants' | 'crew' | 'light';

/**
 * front: a straight-on portrait of the jar, slightly from above (jar pages).
 * iso:   a raised corner view with a long lens, close to isometric (builder).
 */
export type View = 'front' | 'iso';

interface Shot {
  /** Centre of what should fill the frame. */
  center: THREE.Vector3;
  /** Height and width of what should fit, in scene units. */
  height: number;
  width: number;
  /** Camera elevation above the horizon, and turn around the jar (radians). */
  elev: number;
  az: number;
  fov: number;
}

const deg = (d: number) => (d * Math.PI) / 180;

function jarWidth(L: Layout) {
  const s = L.shape;
  return s.kind === 'square' ? s.hx * 2 + 0.6 : Math.max(...s.profile.map(([r]) => r)) * 2 + 0.3;
}

function groundWidth(L: Layout) {
  const fp = L.groundFp;
  return (fp.kind === 'circle' ? fp.r : Math.max(fp.hx, fp.hz)) * 2;
}

/** Where to put the camera for each focus. extraTop leaves room for a grow light hung above the jar. */
export function shotFor(L: Layout, focus: Focus, view: View, extraTop: number): Shot {
  const top = L.shape.top;
  const whole = (elev: number, az: number, fov: number, roomForLamp = extraTop): Shot => {
    const height = top - L.baseY + 0.35 + roomForLamp;
    return { center: new THREE.Vector3(0, L.baseY + height * 0.46, 0), height, width: jarWidth(L), elev, az, fov };
  };
  if (view === 'front') return whole(deg(11), 0, 30);

  const az = deg(38);
  const fov = 20;
  switch (focus) {
    case 'layers': {
      // Low and close on the side wall, where the drainage, barrier and soil show as bands.
      const y0 = L.floorY - 0.05;
      const y1 = L.gy + 0.12;
      return { center: new THREE.Vector3(0, (y0 + y1) / 2, 0), height: y1 - y0 + 0.3, width: jarWidth(L) * 0.92, elev: deg(9), az, fov };
    }
    case 'plants':
      // From above, onto the soil surface: easy to see and arrange what is planted where.
      return { center: new THREE.Vector3(0, L.gy + 0.2, 0), height: 0.7, width: groundWidth(L) + 0.25, elev: deg(50), az, fov };
    case 'crew':
      // Close on the soil, where the animals live.
      return { center: new THREE.Vector3(0, L.gy + 0.04, 0.1), height: 0.42, width: groundWidth(L) * 0.75, elev: deg(34), az, fov };
    case 'light': {
      // Pulled back to take in the room: the window, the lamp, the shelf.
      const height = top - L.baseY + 1.9 + extraTop;
      return { center: new THREE.Vector3(-0.3, L.baseY + height * 0.45, 0), height, width: jarWidth(L) + 2.6, elev: deg(16), az, fov: 24 };
    }
    default:
      // The lamp gets its own shot (light); here the jar fills the frame.
      return whole(deg(27), az, fov, 0);
  }
}

/** Distance at which the shot's box fills the frame, allowing for the angle it is seen from. */
function distanceFor(shot: Shot, aspect: number) {
  const vfov = deg(shot.fov);
  const seenHeight = shot.height * Math.cos(shot.elev) + shot.width * 0.85 * Math.sin(shot.elev);
  const seenWidth = shot.width;
  return Math.max(seenHeight / (2 * Math.tan(vfov / 2)), seenWidth / (2 * Math.tan(vfov / 2) * aspect)) * 1.06;
}

/**
 * Moves the camera to the shot for the current focus, easing between shots so
 * the change reads as moving closer rather than a cut. Snaps when the visitor
 * prefers reduced motion, and on the first frame.
 */
export function CameraRig({ L, focus, view, extraTop }: { L: Layout; focus: Focus; view: View; extraTop: number }) {
  const { camera, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const target = useMemo(() => {
    const shot = shotFor(L, focus, view, extraTop);
    const d = distanceFor(shot, size.width / Math.max(1, size.height));
    const dir = new THREE.Vector3(Math.sin(shot.az) * Math.cos(shot.elev), Math.sin(shot.elev), Math.cos(shot.az) * Math.cos(shot.elev));
    return { pos: shot.center.clone().add(dir.multiplyScalar(d)), look: shot.center.clone(), fov: shot.fov };
  }, [L, focus, view, extraTop, size.width, size.height]);

  const look = useRef<THREE.Vector3 | null>(null);
  const still = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  useEffect(() => {
    if (look.current && !still) return;
    // First frame (or reduced motion): go straight there.
    cam.position.copy(target.pos);
    cam.fov = target.fov;
    cam.updateProjectionMatrix();
    look.current = target.look.clone();
    cam.lookAt(look.current);
  }, [cam, target, still]);

  useFrame((_, raw) => {
    if (!look.current) return;
    const k = 1 - Math.exp(-Math.min(raw, 1 / 20) * 3.2);
    cam.position.lerp(target.pos, k);
    look.current.lerp(target.look, k);
    if (Math.abs(cam.fov - target.fov) > 0.01) {
      cam.fov += (target.fov - cam.fov) * k;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(look.current);
  });
  return null;
}
