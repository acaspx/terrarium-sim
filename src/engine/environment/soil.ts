import { CONFIG } from '../core/config.js';
import { clamp } from '../core/math.js';
import type { Soil, TerrariumState } from '../core/types.js';
import { substrateOf } from './geometry.js';

/** pH of a mix when nothing says otherwise: a typical peat-and-bark blend. */
export const DEFAULT_PH = 6.2;

/** Air in the pore space: plenty below field capacity, gone once the soil is saturated. */
export function soilAirTarget(moisture: number): number {
  return clamp((1.08 - moisture) / 0.38);
}

export function initialSoil(s: Pick<TerrariumState, 'container' | 'pools'>, moisture: number): Soil {
  return { pH: substrateOf(s.container).pH ?? DEFAULT_PH, air: soilAirTarget(moisture) };
}

/**
 * The substrate as roots feel it, for one hour.
 *   air - drains away within a day of waterlogging, comes back within hours of draining
 *   pH  - organic acids from decay slowly sour the mix; its own minerals pull it back
 */
export function stepSoil(s: TerrariumState, decayedG: number): void {
  const soil = (s.soil ??= initialSoil(s, s.climate.moisture));
  const target = soilAirTarget(s.climate.moisture);
  soil.air += (target - soil.air) * (target < soil.air ? CONFIG.soilAirLossPerH : CONFIG.soilAirGainPerH);

  const base = substrateOf(s.container).pH ?? DEFAULT_PH;
  soil.pH -= (decayedG / Math.max(0.1, s.container.substrateL)) * CONFIG.acidPerGPerL;
  soil.pH += ((base - soil.pH) * CONFIG.pHBufferPerDay) / 24;
  soil.pH = clamp(soil.pH, 3.5, 8.5);
}
