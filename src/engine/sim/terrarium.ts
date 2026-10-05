import { CONFIG } from '../core/config.js';
import type { Container, FaunaState, PlantState, TerrariumState } from '../core/types.js';
import { stepGas, stepWater, updateClimate } from '../environment/climate.js';
import { geometry, substrateOf } from '../environment/geometry.js';
import { stepDecomposition } from '../organisms/decomposition.js';
import { stepFauna } from '../organisms/fauna.js';
import { stepPlants } from '../organisms/plants.js';
import { faunaSpecies, plantSpecies } from '../organisms/species.js';

export interface Setup {
  seed?: number;
  container: Container;
  /** Starting substrate moisture as a fraction of field capacity. ~0.75 is "damp, not soggy". */
  initialMoisture?: number;
  /** Fresh, easily rotted organic matter in a new build (g dry). Drives the first-month mold bloom. */
  initialDetritusG?: number;
  plants?: { speciesId: string; biomassG: number }[];
  fauna?: { speciesId: string; count: number }[];
}

export function createTerrarium(setup: Setup): TerrariumState {
  const g = geometry(setup.container);
  const s: TerrariumState = {
    hour: 0,
    seed: setup.seed ?? 1,
    container: structuredClone(setup.container),
    interiorTempC: setup.container.room.tempC,
    pools: {
      substrateWaterG: g.fieldCapacityG * (setup.initialMoisture ?? 0.75),
      reservoirWaterG: 0,
      condensationG: 0,
      co2Mg: (CONFIG.ambientCo2Ppm / 1000) * g.airL * CONFIG.co2MgPerLPer1000Ppm,
      detritusG: setup.initialDetritusG ?? 8 * setup.container.substrateL,
      humusG: substrateOf(setup.container).humusGPerL * setup.container.substrateL,
      nutrientMg: substrateOf(setup.container).nutrientMgPerL * setup.container.substrateL,
      moldG: CONFIG.mold.sporeFloorG,
    },
    plants: [],
    fauna: [],
    climate: undefined as never,
    events: [],
    waterLostG: 0,
    waterAddedG: 0,
    waterloggedHours: 0,
    nextId: 1,
  };
  for (const p of setup.plants ?? []) addPlant(s, p.speciesId, p.biomassG);
  for (const f of setup.fauna ?? []) addFauna(s, f.speciesId, f.count);
  s.climate = updateClimate(s);
  return s;
}

export function addPlant(s: TerrariumState, speciesId: string, biomassG: number): PlantState {
  plantSpecies(speciesId); // validates
  const pl: PlantState = { id: `${speciesId}-${s.nextId++}`, speciesId, biomassG, health: 1, turgor: 1, lightEma: 0.35 };
  s.plants.push(pl);
  return pl;
}

export function addFauna(s: TerrariumState, speciesId: string, count: number): FaunaState {
  faunaSpecies(speciesId);
  const existing = s.fauna.find((f) => f.speciesId === speciesId);
  if (existing) {
    existing.adults += count;
    return existing;
  }
  const f: FaunaState = { speciesId, eggs: 0, juveniles: count * 0.4, adults: count * 0.6 };
  s.fauna.push(f);
  return f;
}

/** Advance the terrarium by one hour. Order matters: climate -> life -> water -> gas. */
export function step(s: TerrariumState): void {
  if (s.ventRevert && s.hour >= s.ventRevert.hour) {
    s.container.ventilation = s.ventRevert.ventilation;
    delete s.ventRevert;
  }
  s.climate = updateClimate(s);
  const transpiration = stepPlants(s);
  stepFauna(s);
  stepDecomposition(s);
  stepWater(s, transpiration);
  stepGas(s);
  s.hour += 1;
}

export function run(s: TerrariumState, hours: number, onDay?: (s: TerrariumState, day: number) => void): void {
  for (let i = 0; i < hours; i++) {
    step(s);
    if (onDay && s.hour % 24 === 0) onDay(s, s.hour / 24);
  }
}

export function totalWaterG(s: TerrariumState): number {
  return s.pools.substrateWaterG + s.pools.reservoirWaterG + s.pools.condensationG;
}
