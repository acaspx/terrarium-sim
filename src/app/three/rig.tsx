import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import type * as THREE from 'three';

/**
 * How the jar is being handled, shared with everything inside it. Plants read
 * it to sway, animals to react, the glass to remember where it was wiped.
 * Mutable on purpose: it changes every frame and nothing re-renders for it.
 */
export interface Motion {
  /** Spin around the vertical axis, and how fast it is still turning. */
  yaw: number;
  yawVel: number;
  /** Rocking on the base: tilt (radians) and its speed, front-back (x) and side to side (z). */
  tiltX: number;
  tiltZ: number;
  tiltXVel: number;
  tiltZVel: number;
  dragging: boolean;
  /** Set while an item inside is being dragged, so the jar holds still. */
  locked: boolean;
  /** Seconds since anyone touched it. */
  idle: number;
  clock: number;
  /** Taps on the soil, in the jar's own coordinates. Animals nearby react. */
  disturbances: { x: number; z: number; t: number }[];
}

export function newMotion(): Motion {
  return {
    yaw: 0, yawVel: 0, tiltX: 0, tiltZ: 0, tiltXVel: 0, tiltZVel: 0,
    dragging: false, locked: false, idle: 99, clock: 0, disturbances: [],
  };
}

export const MotionContext = createContext<Motion | null>(null);
export function useMotion(): Motion {
  const m = useContext(MotionContext);
  if (!m) throw new Error('useMotion outside a JarRig');
  return m;
}

/** How hard the jar is moving right now: 0 at rest, about 1 after a firm flick. */
export const shakeOf = (m: Motion) => Math.min(2, (Math.abs(m.tiltXVel) + Math.abs(m.tiltZVel)) / 1.5);

/** A gentle knock, as when a finger taps the jar. */
export function nudge(m: Motion, strength = 0.5) {
  m.tiltXVel += strength;
  m.idle = 0;
}

export function disturb(m: Motion, x: number, z: number) {
  m.disturbances.push({ x, z, t: m.clock });
  if (m.disturbances.length > 8) m.disturbances.shift();
  nudge(m, 0.35);
}

/** A tap rather than a drag: the pointer barely moved between press and release. */
export const isTap = (e: ThreeEvent<MouseEvent>) => e.delta < 6;

const SPIN_PER_PX = 0.009;
const TILT_LIMIT = 0.14;

/**
 * Holds the jar. Dragging spins it with momentum; the speed of the drag rocks it
 * on its base, and it settles back like a weighted jar. Left alone, it drifts
 * slowly round if `autoRotate` is on. Horizontal drags turn the jar; vertical
 * swipes still scroll the page on a phone.
 */
export function JarRig({ motion, autoRotate, radius, children }: { motion: Motion; autoRotate: boolean; radius: number; children: ReactNode }) {
  const spin = useRef<THREE.Group>(null);
  const rock = useRef<THREE.Group>(null);
  // The element r3f listens on; listening there too means item handlers run first and can lock the jar.
  const target = useThree((s) => s.events.connected) as HTMLElement | undefined;

  useEffect(() => {
    if (!target) return;
    let last: { x: number; y: number; t: number } | null = null;
    const down = (e: PointerEvent) => {
      if (motion.locked) return;
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      motion.dragging = true;
      motion.idle = 0;
    };
    const move = (e: PointerEvent) => {
      if (!last) return;
      if (motion.locked) {
        last = null;
        motion.dragging = false;
        return;
      }
      const now = performance.now();
      const dt = Math.max(8, now - last.t) / 1000;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      motion.yaw += dx * SPIN_PER_PX;
      motion.yawVel = 0.6 * ((dx * SPIN_PER_PX) / dt) + 0.4 * motion.yawVel;
      // Pushing the jar rocks it the way it is pushed.
      motion.tiltZVel -= dx * 0.012;
      motion.tiltXVel += dy * 0.008;
      motion.idle = 0;
      last = { x: e.clientX, y: e.clientY, t: now };
    };
    const up = () => {
      last = null;
      motion.dragging = false;
    };
    target.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    const prevTouch = target.style.touchAction;
    target.style.touchAction = 'pan-y';
    return () => {
      target.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      target.style.touchAction = prevTouch;
    };
  }, [target, motion]);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30);
    const m = motion;
    m.clock += dt;
    m.idle += dt;
    if (!m.dragging) {
      m.yaw += m.yawVel * dt;
      m.yawVel *= Math.exp(-dt * 2.2);
      if (autoRotate && m.idle > 2.5) m.yawVel += (0.22 - m.yawVel) * (1 - Math.exp(-dt * 0.8));
    }
    // A damped spring: the jar settles back onto its base after a few wobbles.
    const k = 55;
    const c = 5;
    m.tiltXVel += (-k * m.tiltX - c * m.tiltXVel) * dt;
    m.tiltZVel += (-k * m.tiltZ - c * m.tiltZVel) * dt;
    m.tiltX = Math.max(-TILT_LIMIT, Math.min(TILT_LIMIT, m.tiltX + m.tiltXVel * dt));
    m.tiltZ = Math.max(-TILT_LIMIT, Math.min(TILT_LIMIT, m.tiltZ + m.tiltZVel * dt));
    if (spin.current) spin.current.rotation.y = m.yaw;
    if (rock.current) {
      rock.current.rotation.set(m.tiltX, 0, m.tiltZ);
      // Rock up onto the edge of the base rather than sinking into the shelf.
      rock.current.position.y = radius * (Math.sin(Math.abs(m.tiltX)) + Math.sin(Math.abs(m.tiltZ)));
    }
  });

  return (
    <MotionContext.Provider value={motion}>
      <group ref={spin}>
        <group ref={rock}>{children}</group>
      </group>
    </MotionContext.Provider>
  );
}

/** Does this hit belong to something inside the jar that answers taps? */
export function interactiveHit(o: THREE.Object3D | null): boolean {
  for (let x = o; x; x = x.parent) if (x.userData.interactive) return true;
  return false;
}
