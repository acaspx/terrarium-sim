import { useSyncExternalStore } from 'react';

/**
 * How much the 3D view asks of the device.
 *   high: refracting glass, real-time shadows, full condensation, every animal.
 *   low:  clear glass without the refraction pass, no real-time shadows, one layer of
 *         condensation beads and no drips, about half the animals, lower pixel density.
 * Low is chosen up front for devices that look weak, and switched to at runtime if
 * the view cannot hold a steady frame rate. ?quality=low|high in the URL overrides
 * both, and is remembered for the visit.
 */
export type Quality = 'high' | 'low';

const KEY = 'terrarium-sim:quality';

function override(): Quality | null {
  try {
    const q = new URLSearchParams(location.search).get('quality') ?? new URLSearchParams(location.hash.split('?')[1] ?? '').get('quality');
    if (q === 'low' || q === 'high') {
      sessionStorage.setItem(KEY, q);
      return q;
    }
    const saved = sessionStorage.getItem(KEY);
    return saved === 'low' || saved === 'high' ? saved : null;
  } catch {
    return null;
  }
}

/** Graphics chips and drivers known to struggle with this scene, or software renderers. */
const WEAK_GPU = /mali-4|mali-t[67]|adreno \(tm\) [34]\d\d|adreno [34]\d\d|powervr sgx|powervr ge8|swiftshader|llvmpipe|softpipe|microsoft basic render/i;

function gpuName(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    // Release the probe straight away; live contexts are capped per page.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return '';
  }
}

/** A first guess from what the browser says about the device. */
export function guessQuality(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  if (WEAK_GPU.test(gpuName())) return 'low';
  if (memory <= 2 || cores <= 2) return 'low';
  // A phone or tablet with modest hardware: start light, since the scene is heavy for its size.
  if (touch && (memory <= 4 || cores <= 4)) return 'low';
  return 'high';
}

let current: Quality | null = null;
/** Set when the visitor chose it, so the frame-rate watch leaves it alone. */
let pinned = false;
const listeners = new Set<() => void>();

function get(): Quality {
  if (current === null) {
    const o = override();
    pinned = o !== null;
    current = o ?? guessQuality();
  }
  return current;
}

/** Step down to low quality (only if the visitor has not pinned a setting). */
export function downgrade() {
  if (pinned || get() === 'low') return;
  current = 'low';
  for (const fn of listeners) fn();
}

export function useQuality(): Quality {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get,
  );
}
