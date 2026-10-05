import { CONFIG } from '../core/config.js';
import type { Container, SubstrateProps } from '../core/types.js';

export const DEFAULT_SUBSTRATE: SubstrateProps = {
  fieldCapacityGPerL: CONFIG.fieldCapacityGPerL,
  humusGPerL: CONFIG.humusGPerL,
  nutrientMgPerL: 120,
  drainPerH: CONFIG.drainPerH,
};

export const substrateOf = (c: Container): SubstrateProps => c.substrate ?? DEFAULT_SUBSTRATE;

/** Derived geometry for a round (cylinder) or square (box) vessel of the given proportion. */
export function geometry(c: Container) {
  const aspect = c.aspect ?? 1.5;
  const volDm3 = c.volumeL;
  let floorDm2: number;
  let glassDm2: number;
  if ((c.form ?? 'round') === 'square') {
    const w = Math.cbrt(volDm3 / aspect);
    floorDm2 = w * w;
    glassDm2 = 4 * w * (aspect * w) + floorDm2;
  } else {
    const d = Math.cbrt(volDm3 / ((Math.PI / 4) * aspect));
    floorDm2 = (Math.PI / 4) * d * d;
    glassDm2 = Math.PI * d * aspect * d + floorDm2;
  }
  return {
    floorM2: floorDm2 / 100,
    glassM2: glassDm2 / 100,
    airL: Math.max(0.1, c.volumeL - c.substrateL - c.drainageL),
    fieldCapacityG: c.substrateL * substrateOf(c).fieldCapacityGPerL,
    reservoirCapacityG: c.drainageL * CONFIG.reservoirGPerL,
  };
}
