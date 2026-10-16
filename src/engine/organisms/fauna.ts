import { CONFIG } from '../core/config.js';
import { clamp, makeRng, thermalPerformance } from '../core/math.js';
import type { FaunaSpecies, TerrariumState } from '../core/types.js';
import { faunaSpecies } from './species.js';

export function moistureFactor(moisture: number, sp: FaunaSpecies): number {
  if (moisture <= sp.moisture.min) return 0;
  const dry = Math.min(1, (moisture - sp.moisture.min) / (sp.moisture.opt - sp.moisture.min));
  const drown = clamp((sp.moisture.max - moisture) / 0.15);
  return Math.min(dry, drown);
}

/**
 * One hour for every animal population. Each species is a three-stage cohort
 * (eggs -> juveniles -> adults) held as continuous numbers, the same structure
 * used by published springtail population models. Temperature and moisture
 * combine by limiting factor (the worse of the two wins), and food supply
 * throttles reproduction, so populations track their food instead of exploding.
 */
export function stepFauna(s: TerrariumState): void {
  const { climate: cl, pools: p } = s;

  for (const f of s.fauna) {
    const sp = faunaSpecies(f.speciesId);
    const tf = thermalPerformance(cl.airTempC, sp.tempC);
    const mf = moistureFactor(cl.moisture, sp);
    const env = Math.min(tf, mf);

    // --- Feeding ---
    const demand = ((f.juveniles * sp.intakeG.juvenile + f.adults * sp.intakeG.adult) * tf) / 24;
    let eaten = 0;
    if (demand > 0) {
      const moldAvail = Math.max(0, p.moldG - CONFIG.mold.sporeFloorG);
      const detAvail = p.detritusG * 0.5;
      const wm = sp.diet.mold * moldAvail;
      const wd = sp.diet.detritus * detAvail;
      const wsum = wm + wd;
      let eatM = wsum > 0 ? Math.min(moldAvail, (demand * wm) / wsum) : 0;
      let eatD = wsum > 0 ? Math.min(detAvail, (demand * wd) / wsum) : 0;
      // Whatever one pool could not supply, try to take from the other.
      const short = demand - eatM - eatD;
      if (short > 0 && sp.diet.detritus > 0) eatD = Math.min(detAvail, eatD + short);
      const short2 = demand - eatM - eatD;
      if (short2 > 0 && sp.diet.mold > 0) eatM = Math.min(moldAvail, eatM + short2);
      p.moldG -= eatM;
      p.detritusG -= eatD * 0.7; // 30% comes back out as frass
      eaten = eatM + eatD;

      // Hunters make up the rest from the colonies they prey on, catching only a few an hour.
      for (const id of sp.prey ?? []) {
        const prey = s.fauna.find((x) => x.speciesId === id);
        const bodyG = prey && faunaSpecies(id).bodyG;
        if (!prey || !bodyG || eaten >= demand) continue;
        const count = prey.adults + prey.juveniles;
        const caught = Math.min((demand - eaten) / bodyG, count * CONFIG.fauna.catchPerHour);
        if (caught <= 0) continue;
        prey.adults -= (caught * prey.adults) / count;
        prey.juveniles -= (caught * prey.juveniles) / count;
        eaten += caught * bodyG;
      }

      // Hungry animals with a taste for greens start on the plants.
      const hunger = 1 - eaten / demand;
      if (hunger > 0.5 && sp.diet.plant > 0 && s.plants.length > 0) {
        const biteDry = demand * hunger * sp.diet.plant;
        const total = s.plants.reduce((a, pl) => a + pl.biomassG, 0);
        for (const pl of s.plants) {
          const share = (biteDry / CONFIG.dryFraction) * (pl.biomassG / total);
          pl.biomassG = Math.max(0, pl.biomassG - share);
          pl.health = clamp(pl.health - share / Math.max(pl.biomassG, 1) * 0.5);
        }
        eaten += biteDry;
      }
      // Digestion mineralises what is eaten: CO2 for the plants, nitrogen for the roots.
      p.co2Mg += eaten * CONFIG.respiredFraction * CONFIG.co2MgPerGDry * 0.5;
      p.nutrientMg += eaten * CONFIG.nitrogenMgPerGDetritus * 0.6;
    }
    const fed = demand > 0 ? clamp(eaten / demand) : 1;

    // --- Life cycle ---
    const density = clamp(1 - (f.juveniles + f.adults) / (sp.densityPerL * s.container.substrateL));
    const heat = cl.airTempC > sp.tempC.max ? 0.5 * (cl.airTempC - sp.tempC.max) : 0;
    const births = (f.adults * sp.fecundityPerDay * env * fed * fed * density) / 24;
    const hatch = (f.eggs / (sp.eggDays * 24)) * env;
    const eggDeaths = (f.eggs * (0.01 + 0.3 * (1 - mf) + heat)) / 24;
    const mature = (f.juveniles / (sp.juvenileDays * 24)) * env * fed;
    const juvDeaths = (f.juveniles * (0.004 + 0.08 * (1 - fed) + 0.4 * (1 - mf) + heat)) / 24;
    const adultDeaths = (f.adults * (1 / sp.adultLifespanDays + 0.05 * (1 - fed) + 0.3 * (1 - mf) + heat)) / 24;

    f.eggs = Math.max(0, f.eggs + births - hatch - eggDeaths);
    f.juveniles = Math.max(0, f.juveniles + hatch - mature - juvDeaths);
    f.adults = Math.max(0, f.adults + mature - adultDeaths);
  }

  s.fauna = s.fauna.filter((f) => {
    if (f.eggs + f.juveniles + f.adults >= 0.5) return true;
    s.events.push({ hour: s.hour, type: 'extinction', message: `${faunaSpecies(f.speciesId).commonName} colony died out.` });
    return false;
  });

  // Fungus gnats are never invited. Once a day, soggy moldy substrate rolls for an invasion.
  if (s.hour % 24 === 0 && !s.fauna.some((f) => f.speciesId === 'fungus-gnat')) {
    const soggy = s.waterloggedHours > 72 || (cl.moisture > 0.95 && p.moldG > 0.3);
    if (soggy && makeRng(s.seed + s.hour)() < 0.08) {
      s.fauna.push({ speciesId: 'fungus-gnat', eggs: 30, juveniles: 0, adults: 2 });
      s.events.push({ hour: s.hour, type: 'invasion', message: 'Fungus gnats have moved into the wet substrate.' });
    }
  }
}
