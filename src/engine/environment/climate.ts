import { CONFIG } from '../core/config.js';
import { clamp, lerp, satVaporDensity, satVaporPressureKPa } from '../core/math.js';
import type { Climate, TerrariumState } from '../core/types.js';
import { geometry, substrateOf } from './geometry.js';

export function co2Ppm(co2Mg: number, airL: number): number {
  return (co2Mg / (airL * CONFIG.co2MgPerLPer1000Ppm)) * 1000;
}

/** Advance interior temperature and derive the climate organisms experience this hour. */
export function updateClimate(s: TerrariumState): Climate {
  const c = s.container;
  const g = geometry(c);
  const hourOfDay = s.hour % 24;
  const lightOn =
    hourOfDay >= CONFIG.lightsOnHour && hourOfDay < CONFIG.lightsOnHour + c.light.photoperiodH;
  const ppfd = lightOn ? c.light.ppfd : 0;

  // Room is warmest mid-afternoon, coolest before dawn.
  const roomTempC = c.room.tempC + c.room.swingC * Math.cos(((hourOfDay - 15) / 24) * 2 * Math.PI);
  // Greenhouse heating under glass; an open lid dumps most of it.
  const heat = c.light.sun ? CONFIG.heatPerPpfdSun : CONFIG.heatPerPpfd;
  const target = roomTempC + ppfd * heat * (1 - 0.7 * c.ventilation);
  s.interiorTempC += (target - s.interiorTempC) * CONFIG.thermalLagPerH;
  const airTempC = s.interiorTempC;
  const glassTempC = roomTempC + 0.3 * (airTempC - roomTempC);

  const moisture = s.pools.substrateWaterG / g.fieldCapacityG;
  const wetness = clamp(moisture / 0.3);
  // Sealed air sits at the dew point of the coldest surface (the glass).
  const rhSealed = Math.min(1, satVaporDensity(glassTempC) / satVaporDensity(airTempC)) * (0.4 + 0.6 * wetness);
  const rh = lerp(rhSealed, c.room.rh, 0.85 * c.ventilation);

  return {
    hourOfDay, lightOn, ppfd, roomTempC, airTempC, glassTempC, rh, moisture,
    co2Ppm: co2Ppm(s.pools.co2Mg, g.airL),
    condensationIndex: s.pools.condensationG / (g.glassM2 * CONFIG.filmPerM2AtIndex1),
    vpdKPa: satVaporPressureKPa(airTempC) * (1 - rh),
  };
}

/** Daily light integral, mol/m2/day: the total light a plant gets in a day. */
export function dli(c: { light: { ppfd: number; photoperiodH: number } }): number {
  return (c.light.ppfd * c.light.photoperiodH * 3600) / 1e6;
}

/**
 * Water cycle for one hour. Vapour from the substrate and from plants either
 * escapes through the lid or condenses on the glass and runs back down.
 * The air itself holds a negligible mass of water (~0.15 g in a 10 L jar),
 * so it is treated as a pipe, not a pool. With ventilation = 0 total water is conserved.
 */
export function stepWater(s: TerrariumState, transpirationG: number): void {
  const c = s.container;
  const g = geometry(c);
  const p = s.pools;
  const { rh, moisture } = s.climate;

  const wetness = clamp(moisture / 0.3);
  const evap = Math.min(p.substrateWaterG, CONFIG.evapCoeff * g.floorM2 * (1 - rh) * wetness);
  p.substrateWaterG -= evap;

  const vapor = evap + transpirationG;
  const escaped = vapor * c.ventilation;
  p.condensationG += vapor - escaped;

  // An open lid also dries the film off the glass.
  const filmLost = p.condensationG * 0.3 * c.ventilation;
  p.condensationG -= filmLost;
  s.waterLostG += escaped + filmLost;

  const runoff = p.condensationG * CONFIG.runoffPerH;
  p.condensationG -= runoff;
  p.substrateWaterG += runoff;

  // Gravity drains anything above field capacity into the false bottom...
  const excess = p.substrateWaterG - g.fieldCapacityG;
  if (excess > 0) {
    const drained = Math.min(excess * substrateOf(c).drainPerH, g.reservoirCapacityG - p.reservoirWaterG);
    p.substrateWaterG -= drained;
    p.reservoirWaterG += drained;
  }
  // ...and the reservoir slowly wicks back up when the substrate dries.
  if (p.substrateWaterG < 0.7 * g.fieldCapacityG) {
    const wick = p.reservoirWaterG * CONFIG.wickPerH;
    p.reservoirWaterG -= wick;
    p.substrateWaterG += wick;
  }

  s.waterloggedHours = p.substrateWaterG > 1.02 * g.fieldCapacityG ? s.waterloggedHours + 1 : 0;
}

/** Gas exchange: sources and sinks are already applied to co2Mg; this handles leakage and venting. */
export function stepGas(s: TerrariumState): void {
  const g = geometry(s.container);
  const k = CONFIG.gasLeakPerH + CONFIG.ventAirChangesPerH * s.container.ventilation;
  const ambientMg = (CONFIG.ambientCo2Ppm / 1000) * g.airL * CONFIG.co2MgPerLPer1000Ppm;
  // Implicit update: stable even when the exchange rate is fast relative to the timestep.
  s.pools.co2Mg = Math.max(0, (s.pools.co2Mg + k * ambientMg) / (1 + k));
}
