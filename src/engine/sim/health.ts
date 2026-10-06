import { clamp } from '../core/math.js';
import type { Alert, TerrariumState } from '../core/types.js';
import { faunaSpecies, plantSpecies } from '../organisms/species.js';

/** Mold mass per litre of substrate at which a keeper would notice fuzzy patches. */
const VISIBLE_MOLD_G_PER_L = 0.1;

/** Turn raw state into the things a keeper would notice, with a fix for each. */
export function alerts(s: TerrariumState): Alert[] {
  const out: Alert[] = [];
  const { climate: cl, pools: p } = s;
  const visibleMoldG = VISIBLE_MOLD_G_PER_L * s.container.substrateL;

  if (s.waterloggedHours > 48)
    out.push({ severity: 'critical', code: 'waterlogged', message: 'Substrate has been saturated for over two days. Roots are rotting.', fix: 'Take the lid off for a day or two and stop watering.' });
  else if (cl.moisture > 0.95)
    out.push({ severity: 'warn', code: 'too-wet', message: 'Substrate is at saturation.', fix: 'Air out for a few hours.' });
  else if (s.soil && s.soil.air < 0.3)
    out.push({ severity: 'warn', code: 'sour-soil', message: 'The soil is short of air and starting to sour.', fix: 'Leave the lid off for a few hours and hold off on water.' });
  if (cl.moisture < 0.35)
    out.push({ severity: cl.moisture < 0.25 ? 'critical' : 'warn', code: 'too-dry', message: 'Substrate is drying out and there is little condensation.', fix: 'Mist lightly and close the lid.' });
  if (cl.condensationIndex > 1)
    out.push({ severity: 'warn', code: 'heavy-condensation', message: 'Glass is streaming wet.', fix: 'Too much water or too much heat from the light. Air out, or move out of direct sun.' });
  if (cl.airTempC > 30)
    out.push({ severity: 'critical', code: 'overheating', message: `Interior is ${cl.airTempC.toFixed(1)} C.`, fix: 'Move out of direct light. A closed jar in sun is a greenhouse.' });
  if (p.moldG > visibleMoldG)
    out.push({ severity: 'warn', code: 'mold-bloom', message: 'Visible mold bloom.', fix: s.fauna.some((f) => f.speciesId === 'springtail') ? 'Springtails are present; give them time, or air out to slow the mold.' : 'Add springtails, remove the worst by hand, and air out.' });
  if (s.fauna.some((f) => f.speciesId === 'fungus-gnat'))
    out.push({ severity: 'warn', code: 'fungus-gnats', message: 'Fungus gnats are breeding.', fix: 'Let the substrate dry toward damp. Springtails compete with the larvae for mold.' });

  for (const pl of s.plants) {
    const sp = plantSpecies(pl.speciesId);
    if (pl.turgor < 0.4) out.push({ severity: 'warn', code: 'wilting', message: `${sp.commonName} is wilting.`, fix: 'Check moisture and humidity.' });
    if (pl.health < 0.4) out.push({ severity: 'critical', code: 'plant-declining', message: `${sp.commonName} is in serious decline.`, fix: 'Check light, moisture and temperature against its range.' });
    if (pl.biomassG > 0.85 * sp.maxBiomassG) out.push({ severity: 'info', code: 'overgrown', message: `${sp.commonName} is outgrowing the jar.`, fix: 'Prune it back by a third.' });
  }
  for (const f of s.fauna) {
    const sp = faunaSpecies(f.speciesId);
    if (sp.role === 'cleanup' && f.adults + f.juveniles < 5)
      out.push({ severity: 'warn', code: 'colony-crashing', message: `${sp.commonName} colony is nearly gone.`, fix: 'Check moisture and add leaf litter.' });
  }
  return out;
}

/** 0-100 score for a dashboard. Weighted toward what keepers actually care about: living plants. */
export function healthScore(s: TerrariumState): number {
  const { climate: cl, pools: p } = s;
  // Dead plants count as zero: losing four of five plants is not a healthy jar.
  const planted = Math.max(s.plants.length, s.planted ?? s.plants.length);
  const plants = planted ? s.plants.reduce((a, pl) => a + pl.health * (0.5 + 0.5 * pl.turgor), 0) / planted : 0;
  const moisture = clamp(1 - Math.abs(cl.moisture - 0.7) / 0.4);
  const crew = s.fauna.some((f) => faunaSpecies(f.speciesId).role === 'cleanup' && f.adults > 5) ? 1 : 0;
  const mold = clamp(1 - p.moldG / (2 * VISIBLE_MOLD_G_PER_L * s.container.substrateL));
  const pests = s.fauna.some((f) => faunaSpecies(f.speciesId).role === 'pest') ? 0 : 1;
  return Math.round(100 * (0.45 * plants + 0.2 * moisture + 0.1 * crew + 0.15 * mold + 0.1 * pests));
}

/** A compact, UI-ready snapshot. */
export function snapshot(s: TerrariumState) {
  return {
    day: Math.floor(s.hour / 24),
    score: healthScore(s),
    climate: s.climate,
    moldG: s.pools.moldG,
    detritusG: s.pools.detritusG,
    plants: s.plants.map((pl) => ({ ...pl, name: plantSpecies(pl.speciesId).commonName })),
    fauna: s.fauna.map((f) => ({ ...f, name: faunaSpecies(f.speciesId).commonName, total: f.eggs + f.juveniles + f.adults })),
    alerts: alerts(s),
  };
}
