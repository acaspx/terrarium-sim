import { CONFIG } from '../core/config.js';
import type { TerrariumState } from '../core/types.js';
import { faunaSpecies, plantSpecies } from '../organisms/species.js';
import { addFauna, addPlant } from './terrarium.js';

/** Share of a plant's mass left in the soil as broken roots when it is dug out. */
const ROOTS_LEFT = 0.15;

/** "rough woodlouse" → "rough woodlice", "springtail" → "springtails". */
const animals = (speciesId: string, count: number) => {
  const name = faunaSpecies(speciesId).commonName.toLowerCase();
  if (count === 1) return name;
  return name.endsWith('woodlouse') ? `${name.slice(0, -5)}lice` : `${name}s`;
};

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

/** sun: daylight from a window, which heats the jar more than a grow light (see CONFIG.heatPerPpfdSun). */
export function setLight(s: TerrariumState, ppfd: number, photoperiodH = s.container.light.photoperiodH, sun = s.container.light.sun): void {
  s.container.light = { ppfd, photoperiodH, ...(sun ? { sun } : {}) };
  log(s, 'care', `Light set to ${ppfd} PPFD for ${photoperiodH} h.`);
}

// ------------------------------------------------------------------ changing a living jar
// Edits made to a jar that is already growing: everything else about it (its age, its
// soil, its water, the plants and animals already there) carries on as it was.

/** Plant something new, at a size in grams of fresh plant, at u, v on the floor. */
export function plant(s: TerrariumState, speciesId: string, biomassG: number, at: [number, number]) {
  const pl = addPlant(s, speciesId, biomassG, at);
  log(s, 'care', `Planted a ${plantSpecies(speciesId).commonName.toLowerCase()}.`);
  return pl;
}

/**
 * Dig a plant out. The fine roots that break off stay behind and rot into the soil; the
 * rest leaves the jar. It does not count as a loss: the keeper chose it.
 */
export function digOut(s: TerrariumState, plantId: string): void {
  const i = s.plants.findIndex((p) => p.id === plantId);
  if (i < 0) throw new Error(`No plant ${plantId}`);
  const pl = s.plants[i]!;
  s.plants.splice(i, 1);
  s.pools.detritusG += pl.biomassG * ROOTS_LEFT * CONFIG.dryFraction;
  s.planted = Math.max(s.plants.length, (s.planted ?? s.plants.length + 1) - 1);
  log(s, 'care', `Dug out a ${plantSpecies(pl.speciesId).commonName.toLowerCase()}.`);
}

/** Move a plant to u, v on the floor (it keeps its size and health). */
export function movePlant(s: TerrariumState, plantId: string, at: [number, number]): void {
  const pl = s.plants.find((p) => p.id === plantId);
  if (!pl) throw new Error(`No plant ${plantId}`);
  pl.at = [at[0], at[1]];
}

/** Add animals: a new species joins, or tops up a colony already living there (as adults). */
export function addAnimals(s: TerrariumState, speciesId: string, count: number): void {
  addFauna(s, speciesId, count);
  log(s, 'care', `Added ${count} ${animals(speciesId, count)}.`);
}

/**
 * Take animals out, adults and young alike. Taking out as many as there are (or more)
 * removes the colony, eggs included, so it does not hatch back.
 */
export function removeAnimals(s: TerrariumState, speciesId: string, count: number): void {
  const i = s.fauna.findIndex((f) => f.speciesId === speciesId);
  if (i < 0) return;
  const f = s.fauna[i]!;
  const total = f.adults + f.juveniles;
  if (count >= total - 0.5) {
    s.fauna.splice(i, 1);
    log(s, 'care', `Took out all the ${animals(speciesId, 2)}.`);
    return;
  }
  const keep = (total - count) / total;
  f.adults *= keep;
  f.juveniles *= keep;
  log(s, 'care', `Took out ${count} ${animals(speciesId, count)}.`);
}
