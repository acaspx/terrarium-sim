import { CONFIG } from '../core/config.js';
import { clamp, makeRng, thermalPerformance, trapezoid } from '../core/math.js';
import type { TerrariumState } from '../core/types.js';
import { MICROBE_TEMP } from './decomposition.js';

/**
 * Wood-rotting fungi. Driftwood arrives already holding fungal threads; in a wet,
 * humid, still jar they spread through the wood, feeding on it. Once the wood is
 * well colonised and the air is saturated, they fruit: a flush of small mushrooms
 * that stands for about a week, collapses into the litter, and leaves the
 * mycelium resting for at least six weeks before it can fruit again. Harmless, and a
 * sign of a working jar.
 */
export function stepFungi(s: TerrariumState): void {
  const p = s.pools;
  const wood = p.woodG ?? 0;
  if (wood <= 0) return;
  const f = CONFIG.fungi;
  const cl = s.climate;
  const fungi = (s.fungi ??= { flushStartHour: -1, lastFlushHour: -1e6 });
  const cap = f.capPerGWood * wood;
  p.myceliumG ??= f.startShare * cap;

  const tf = thermalPerformance(cl.airTempC, MICROBE_TEMP);
  const moistF = trapezoid(cl.moisture, 0.3, 0.6, 1.0, 1.4);
  const conditions = moistF * clamp((cl.rh - 0.7) / 0.2) * tf * (1 - 0.6 * s.container.ventilation);

  // The mycelium eats the wood; part of it is respired, part returns as nitrogen.
  const decayed = (wood * f.woodDecayPerDay * Math.max(0.2, conditions)) / 24;
  p.woodG = wood - decayed;
  p.co2Mg += decayed * CONFIG.respiredFraction * CONFIG.co2MgPerGDry;
  p.nutrientMg += decayed * CONFIG.nitrogenMgPerGDetritus * 0.3;
  p.myceliumG += ((p.myceliumG * f.growthPerDay * conditions) / 24) * (1 - p.myceliumG / cap);
  // Dry spells kill back the threads.
  if (moistF === 0) p.myceliumG *= 1 - 0.05 / 24;
  p.myceliumG = Math.max(0.002 * cap, p.myceliumG);

  if (fungi.flushStartHour >= 0) {
    const age = s.hour - fungi.flushStartHour;
    if (age < f.flushDays * 24) {
      // Caps open over three days, then stand until they collapse.
      p.mushroomG = p.myceliumG * f.mushroomPerGMycelium * Math.min(1, age / 72);
    } else {
      p.detritusG += (p.mushroomG ?? 0) * CONFIG.dryFraction;
      p.myceliumG *= 0.5; // fruiting spends the mycelium
      p.mushroomG = 0;
      fungi.flushStartHour = -1;
      fungi.lastFlushHour = s.hour;
    }
    return;
  }

  // Once a day, around midday, a ready mycelium in saturated air may fruit.
  const ready =
    p.myceliumG > f.fruitAtShare * cap &&
    cl.rh > f.fruitMinRh &&
    cl.moisture > f.fruitMinMoisture &&
    s.hour - fungi.lastFlushHour > f.restDays * 24;
  if (ready && s.hour % 24 === 12 && makeRng(s.seed * 7 + s.hour)() < 0.12) {
    fungi.flushStartHour = s.hour;
    s.events.push({ hour: s.hour, type: 'mushrooms', message: 'Mushrooms have come up on the driftwood. Harmless, and gone in about a week.' });
  }
}
