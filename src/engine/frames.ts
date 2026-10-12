/**
 * Keyframes: compact pictures of a jar at a moment, enough to draw it again.
 * A jar records one a week; a run of them is its time-lapse. A frame keeps what
 * you can see (plants, animals, water, mold, mushrooms, the lid and light) and
 * drops the bookkeeping, so a year of weekly frames stays small enough to share.
 */
import type { FaunaState, PlantState, Pools, TerrariumState } from './core/types.js';
import { updateClimate } from './environment/climate.js';
import type { TerrariumSpec } from './spec.js';
import { buildTerrarium } from './spec.js';

export interface Frame {
  hour: number;
  plants: Pick<PlantState, 'id' | 'speciesId' | 'biomassG' | 'health' | 'turgor' | 'at'>[];
  fauna: FaunaState[];
  pools: Pick<Pools, 'substrateWaterG' | 'reservoirWaterG' | 'condensationG' | 'moldG' | 'detritusG' | 'mushroomG'>;
  ventilation: number;
  light: { ppfd: number; photoperiodH: number };
  waterloggedHours: number;
  pH?: number;
}

/** Keep about three significant figures: plenty to draw from, and a third of the size. */
const r3 = (x: number) => (x === 0 || !Number.isFinite(x) ? 0 : Number(x.toPrecision(3)));

export function toFrame(s: TerrariumState): Frame {
  const p = s.pools;
  return {
    hour: s.hour,
    plants: s.plants.map((pl) => ({
      id: pl.id, speciesId: pl.speciesId, biomassG: r3(pl.biomassG), health: r3(pl.health), turgor: r3(pl.turgor),
      ...(pl.at ? { at: [r3(pl.at[0]), r3(pl.at[1])] as [number, number] } : {}),
    })),
    fauna: s.fauna.map((f) => ({ speciesId: f.speciesId, eggs: r3(f.eggs), juveniles: r3(f.juveniles), adults: r3(f.adults) })),
    pools: {
      substrateWaterG: r3(p.substrateWaterG), reservoirWaterG: r3(p.reservoirWaterG), condensationG: r3(p.condensationG),
      moldG: r3(p.moldG), detritusG: r3(p.detritusG), ...(p.mushroomG !== undefined ? { mushroomG: r3(p.mushroomG) } : {}),
    },
    ventilation: r3(s.container.ventilation),
    light: { ppfd: r3(s.container.light.ppfd), photoperiodH: r3(s.container.light.photoperiodH) },
    waterloggedHours: s.waterloggedHours,
    ...(s.soil ? { pH: r3(s.soil.pH) } : {}),
  };
}

/** A drawable state for a frame: the design's own jar, with the frame's moment laid over it. */
export function expandFrame(spec: TerrariumSpec, f: Frame): TerrariumState {
  const s = buildTerrarium(spec);
  s.hour = f.hour;
  s.plants = f.plants.map((pl) => ({ ...pl, lightEma: 0.35 }));
  s.fauna = f.fauna.map((x) => ({ ...x }));
  s.pools = { ...s.pools, ...f.pools };
  s.container = { ...s.container, ventilation: f.ventilation, light: { ...f.light } };
  s.waterloggedHours = f.waterloggedHours;
  if (s.soil && f.pH !== undefined) s.soil = { ...s.soil, pH: f.pH };
  s.events = [];
  s.climate = updateClimate(s);
  return s;
}

/** Most frames a jar keeps. When full, every other frame is dropped, so the record always spans the whole life. */
export const MAX_FRAMES = 40;

/** Add a frame, thinning older ones evenly once the record is full. */
export function recordFrame(frames: Frame[], f: Frame): Frame[] {
  const next = [...frames, f];
  if (next.length <= MAX_FRAMES) return next;
  // Keep the first (planting) and the newest; drop every other one in between.
  return next.filter((_, i) => i === 0 || i === next.length - 1 || i % 2 === 0);
}

/** A frame is due once a week, in the early afternoon so the lights are usually on. */
export const frameDue = (s: TerrariumState) => s.hour % (24 * 7) === 14;
