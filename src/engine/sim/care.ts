import type { TerrariumState } from '../core/types.js';

/** Everything a keeper can do to the jar. Each action logs an event. */

const log = (s: TerrariumState, type: string, message: string) => s.events.push({ hour: s.hour, type, message });

export function mist(s: TerrariumState, ml: number): void {
  s.pools.substrateWaterG += ml;
  s.waterAddedG += ml;
  log(s, 'care', `Misted ${ml} ml.`);
}

/** 0 = sealed, 1 = lid off. */
export function setVentilation(s: TerrariumState, ventilation: number): void {
  s.container.ventilation = Math.min(1, Math.max(0, ventilation));
  delete s.ventRevert;
  log(s, 'care', `Ventilation set to ${s.container.ventilation}.`);
}

/** Take the lid off for a while, then put it back the way it was. */
export function airOut(s: TerrariumState, hours: number): void {
  const previous = s.ventRevert?.ventilation ?? s.container.ventilation;
  s.container.ventilation = 1;
  s.ventRevert = { hour: s.hour + hours, ventilation: previous };
  log(s, 'care', `Lid off for ${hours} h.`);
}

/** Cut a plant back. Clippings are removed unless you leave them to rot. */
export function prune(s: TerrariumState, plantId: string, fraction: number, leaveClippings = false): void {
  const pl = s.plants.find((p) => p.id === plantId);
  if (!pl) throw new Error(`No plant ${plantId}`);
  const cut = pl.biomassG * Math.min(0.9, Math.max(0, fraction));
  pl.biomassG -= cut;
  if (leaveClippings) s.pools.detritusG += cut * 0.12;
  log(s, 'care', `Pruned ${cut.toFixed(1)} g from ${plantId}.`);
}

/** Add leaf litter or food for the clean-up crew (grams, dry). */
export function feed(s: TerrariumState, grams: number): void {
  s.pools.detritusG += grams;
  log(s, 'care', `Added ${grams} g of leaf litter / food.`);
}

/** Physically wipe out visible mold. Spores remain. */
export function removeMold(s: TerrariumState): void {
  s.pools.moldG *= 0.15;
  log(s, 'care', 'Removed visible mold.');
}

export function setLight(s: TerrariumState, ppfd: number, photoperiodH = s.container.light.photoperiodH): void {
  s.container.light = { ppfd, photoperiodH };
  log(s, 'care', `Light set to ${ppfd} PPFD for ${photoperiodH} h.`);
}
