import { CONFIG } from '../core/config.js';
import { clamp, thermalPerformance, trapezoid } from '../core/math.js';
import type { TerrariumState } from '../core/types.js';

const MICROBE_TEMP = { min: 2, opt: 28, max: 40 };

/**
 * Microbes and mold. Background microbial decay slowly turns detritus into
 * CO2 and plant-available nitrogen. Mold is the visible, fast fraction: it
 * blooms on fresh detritus when the jar is wet, humid and stagnant, and is
 * held down by grazing (see fauna.ts). A new build starts with a pulse of
 * labile detritus, so the classic first-month mold bloom emerges on its own.
 */
export function stepDecomposition(s: TerrariumState): void {
  const { climate: cl, pools: p } = s;
  const m = CONFIG.mold;
  const tf = thermalPerformance(cl.airTempC, MICROBE_TEMP);

  const moistF = trapezoid(cl.moisture, 0.1, 0.5, 1.0, 1.5);
  const decayed = (p.detritusG * CONFIG.decompPerDay * tf * moistF) / 24;
  p.detritusG -= decayed;
  p.co2Mg += decayed * CONFIG.respiredFraction * CONFIG.co2MgPerGDry;
  p.nutrientMg += decayed * CONFIG.nitrogenMgPerGDetritus;

  // The substrate itself (bark, coir) rots far more slowly, but it is what keeps
  // a sealed jar supplied with CO2 and nitrogen for years after the litter is gone.
  const humusDecayed = (p.humusG * CONFIG.humusDecompPerDay * tf * moistF) / 24;
  p.humusG -= humusDecayed;
  p.co2Mg += humusDecayed * CONFIG.respiredFraction * CONFIG.co2MgPerGDry;
  p.nutrientMg += humusDecayed * CONFIG.nitrogenMgPerGDetritus * 0.5;

  const conditions =
    clamp((cl.moisture - m.minMoisture) / 0.25) *
    clamp((cl.rh - m.minRh) / 0.2) *
    tf *
    (1 - 0.6 * s.container.ventilation);
  const cap = Math.max(m.sporeFloorG, p.detritusG * m.capPerGDetritus);
  const growth = ((p.moldG * m.growthPerDay * conditions) / 24) * (1 - p.moldG / cap);
  const death = (p.moldG * m.deathPerDay) / 24;
  if (growth > 0) {
    p.detritusG = Math.max(0, p.detritusG - growth * m.detritusPerGMold);
    p.co2Mg += growth * CONFIG.co2MgPerGDry * 0.5;
  }
  p.detritusG += death;
  // Spores are everywhere; mold can be beaten back but never eradicated.
  p.moldG = Math.max(m.sporeFloorG, p.moldG + growth - death);
}
