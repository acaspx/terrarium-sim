import { CONFIG } from '../core/config.js';
import { clamp, thermalPerformance, trapezoid } from '../core/math.js';
import type { PlantSpecies, TerrariumState } from '../core/types.js';
import { plantSpecies } from './species.js';

/** Grams of fresh plant biomass a litre of container can hold before everything is crowded. */
const CANOPY_G_PER_L = 12;

export function lightFactor(ppfd: number, sp: PlantSpecies): number {
  if (ppfd <= sp.light.comp) return 0;
  const f = Math.min(1, (ppfd - sp.light.comp) / (sp.light.opt - sp.light.comp));
  return ppfd > sp.light.max ? f * Math.max(0, 1 - (ppfd - sp.light.max) / sp.light.max) : f;
}

/**
 * One hour of plant life. Returns total transpiration (g) for the water cycle.
 *
 * Growth follows Liebig's law: the scarcest of light, water, temperature and
 * humidity sets the pace, then CO2 and nitrogen scale it. Two separate state
 * variables model what a keeper actually sees:
 *   turgor - fast: wilts in hours-days, bounces back when watered
 *   health - slow: accumulated damage; at 0 the plant dies and becomes detritus
 */
export function stepPlants(s: TerrariumState): number {
  const { climate: cl, pools: p } = s;
  const totalBiomass = s.plants.reduce((a, pl) => a + pl.biomassG, 0);
  const canopyRoom = clamp(1 - totalBiomass / (s.container.volumeL * CANOPY_G_PER_L));
  let transpiration = 0;

  for (const pl of s.plants) {
    const sp = plantSpecies(pl.speciesId);
    const lightF = lightFactor(cl.ppfd, sp);
    const waterF = trapezoid(cl.moisture, sp.moisture.min, sp.moisture.optLow, sp.moisture.optHigh, sp.moisture.max);
    const tempF = thermalPerformance(cl.airTempC, sp.tempC);
    const rhF = clamp((cl.rh - 0.5 * sp.rhMin) / (0.5 * sp.rhMin));
    const co2F = cl.co2Ppm / (cl.co2Ppm + CONFIG.co2HalfSatPpm);
    const nutF = p.nutrientMg / (p.nutrientMg + CONFIG.nutrientHalfSatMg);

    // Turgor: driven by the dry side only (waterlogging rots, it does not wilt).
    const drySide = clamp((cl.moisture - sp.moisture.min) / (sp.moisture.optLow - sp.moisture.min));
    const hydration = Math.min(drySide, rhF);
    pl.turgor = clamp(
      pl.turgor +
        (hydration < 0.3
          ? (-sp.wiltPerDay / 24) * (1 - hydration / 0.3)
          : (sp.recoverPerDay / 24) * hydration),
    );

    // Growth (only happens in the light, because lightF is 0 in the dark).
    const limit = Math.min(lightF, waterF, tempF, rhF) * co2F * nutF * pl.turgor;
    let growth = (sp.rgrPerDay / 12) * pl.biomassG * limit * (1 - pl.biomassG / sp.maxBiomassG) * canopyRoom;
    growth = Math.max(0, growth);
    const co2Need = growth * CONFIG.dryFraction * CONFIG.co2MgPerGDry;
    const nNeed = growth * CONFIG.nitrogenMgPerGFresh;
    const scale = Math.min(1, co2Need > 0 ? (p.co2Mg * 0.9) / co2Need : 1, nNeed > 0 ? p.nutrientMg / nNeed : 1);
    growth *= scale;
    p.co2Mg -= co2Need * scale;
    p.nutrientMg -= nNeed * scale;

    // Maintenance respiration and litter fall.
    const respired = (pl.biomassG * 0.003) / 24;
    p.co2Mg += respired * CONFIG.dryFraction * CONFIG.co2MgPerGDry;
    const litter = (pl.biomassG * sp.litterPerDay) / 24;
    p.detritusG += litter * CONFIG.dryFraction;
    pl.biomassG += growth - respired - litter;

    // Health integrates stress over days. Light is judged on a 2-day running mean.
    pl.lightEma += (lightF - pl.lightEma) / 48;
    const lightScore = clamp(pl.lightEma / 0.35);
    const stress = Math.min(lightScore, waterF, tempF, rhF);
    if (stress < 0.25) pl.health -= (sp.declinePerDay / 24) * (1 - stress / 0.25);
    else if (stress > 0.5) pl.health += 0.02 / 24;
    if (pl.turgor < 0.1) pl.health -= sp.declinePerDay / 24;
    if (cl.ppfd > sp.light.max) pl.health -= (0.1 / 24) * ((cl.ppfd - sp.light.max) / sp.light.max);
    pl.health = clamp(pl.health);

    const t = Math.min(
      p.substrateWaterG,
      pl.biomassG * sp.transpiration * (1 - cl.rh) * (cl.lightOn ? 1 : 0.15) * clamp(cl.moisture / sp.moisture.optLow),
    );
    p.substrateWaterG -= t;
    transpiration += t;
  }

  // The dead become food for the clean-up crew.
  s.plants = s.plants.filter((pl) => {
    if (pl.health > 0 && pl.biomassG > 0.05) return true;
    p.detritusG += pl.biomassG * CONFIG.dryFraction;
    s.events.push({ hour: s.hour, type: 'plant-death', message: `${plantSpecies(pl.speciesId).commonName} (${pl.id}) died.` });
    return false;
  });
  return transpiration;
}
