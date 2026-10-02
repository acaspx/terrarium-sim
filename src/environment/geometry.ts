import { CONFIG } from '../core/config.js';
import type { Container } from '../core/types.js';

/** Derived geometry, assuming an upright cylinder 1.5x as tall as it is wide. */
export function geometry(c: Container) {
  const dDm = Math.cbrt(c.volumeL / ((Math.PI / 4) * 1.5));
  const floorM2 = ((Math.PI / 4) * dDm * dDm) / 100;
  const glassM2 = (Math.PI * dDm * 1.5 * dDm) / 100 + floorM2;
  return {
    floorM2,
    glassM2,
    airL: Math.max(0.1, c.volumeL - c.substrateL - c.drainageL),
    fieldCapacityG: c.substrateL * CONFIG.fieldCapacityGPerL,
    reservoirCapacityG: c.drainageL * CONFIG.reservoirGPerL,
  };
}
