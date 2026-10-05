/**
 * The customization layer. A TerrariumSpec is what a person designs in the
 * builder; specToSetup() turns it into physical parameters for the engine.
 *
 * Rule for v1: every option must change the simulation. Purely cosmetic
 * choices are deferred (see docs/CUSTOMIZATION.md).
 */
import { CONFIG } from './core/config.js';
import type { Container, SubstrateProps, TerrariumState } from './core/types.js';
import { faunaSpecies, plantSpecies, SPECIES } from './organisms/species.js';
import { healthScore } from './sim/health.js';
import { createTerrarium, run, type Setup } from './sim/terrarium.js';

export type VesselId = 'jar' | 'bottle' | 'cloche' | 'bowl' | 'cube' | 'wardian';
export type LidId = 'sealed' | 'cork' | 'cracked' | 'open';
export type DrainageId = 'none' | 'leca' | 'gravel';
export type SubstrateId = 'abg' | 'bioactive' | 'peat' | 'potting-soil';
export type DepthId = 'shallow' | 'standard' | 'deep';
export type PlacementId = 'dim-corner' | 'north-window' | 'east-window' | 'grow-light' | 'south-window';
export type GrowLightId = 'low' | 'medium' | 'high';
export type RoomId = 'cool' | 'average' | 'warm';
export type MoistureId = 'dry' | 'damp' | 'wet';
export type PlantSizeId = 'plug' | 'small' | 'medium';
export type HardscapeId = 'wood' | 'stone' | 'leaf-litter';

export interface TerrariumSpec {
  name: string;
  vessel: VesselId;
  sizeL: number;
  lid: LidId;
  drainage: DrainageId;
  substrate: SubstrateId;
  depth: DepthId;
  hardscape: HardscapeId[];
  plants: { speciesId: string; size: PlantSizeId }[];
  fauna: { speciesId: string; count: number }[];
  placement: PlacementId;
  growLight: GrowLightId;
  room: RoomId;
  startMoisture: MoistureId;
  seed: number;
}

interface Option<T extends string> { id: T; label: string; detail: string }

export const VESSELS: (Option<VesselId> & {
  form: 'round' | 'square'; aspect: number; opening: number; sizes: number[]; defaultLid: LidId; lids: LidId[];
})[] = [
  { id: 'jar', label: 'Apothecary jar', detail: 'Wide mouth, glass lid. The easy all-rounder.', form: 'round', aspect: 1.4, opening: 1, sizes: [1, 3, 6, 12], defaultLid: 'sealed', lids: ['sealed', 'cork', 'cracked', 'open'] },
  { id: 'bottle', label: 'Cork bottle', detail: 'Narrow neck. Very stable once balanced, fiddly to plant and prune.', form: 'round', aspect: 1.25, opening: 0.35, sizes: [3, 6, 12, 25], defaultLid: 'cork', lids: ['cork', 'cracked', 'open'] },
  { id: 'cloche', label: 'Bell cloche', detail: 'A dome over a base. Air seeps in under the rim.', form: 'round', aspect: 1.15, opening: 1, sizes: [3, 6, 12], defaultLid: 'sealed', lids: ['sealed', 'cracked'] },
  { id: 'bowl', label: 'Bubble bowl', detail: 'Round with a side opening. Usually kept open.', form: 'round', aspect: 0.9, opening: 0.7, sizes: [1, 3, 6], defaultLid: 'open', lids: ['sealed', 'cracked', 'open'] },
  { id: 'cube', label: 'Glass cube', detail: 'Flat sides, sliding lid. Easy to see into and work in.', form: 'square', aspect: 1, opening: 1, sizes: [6, 12, 25, 40], defaultLid: 'sealed', lids: ['sealed', 'cracked', 'open'] },
  { id: 'wardian', label: 'Wardian case', detail: 'A glass cabinet with a roof vent, after the Victorian plant-collector cases.', form: 'square', aspect: 1.15, opening: 0.8, sizes: [12, 25, 40], defaultLid: 'cracked', lids: ['sealed', 'cracked'] },
];

export const SIZE_LABELS: Record<number, string> = { 1: 'Mini', 3: 'Small', 6: 'Medium', 12: 'Large', 25: 'Showcase', 40: 'Display' };

export const LIDS: (Option<LidId> & { vent: number })[] = [
  { id: 'sealed', label: 'Sealed', detail: 'Fully closed. Water cycles inside indefinitely.', vent: 0 },
  { id: 'cork', label: 'Cork', detail: 'Closed, but cork breathes a little.', vent: 0.01 },
  { id: 'cracked', label: 'Vented', detail: 'Lid ajar or vented. Less mold, slow drying.', vent: 0.12 },
  { id: 'open', label: 'Open top', detail: 'No lid. Dries out; needs regular misting.', vent: 1 },
];

export const DRAINAGE: (Option<DrainageId> & { fraction: number })[] = [
  { id: 'leca', label: 'LECA false bottom', detail: 'Clay balls hold excess water away from roots and wick it back.', fraction: 0.1 },
  { id: 'gravel', label: 'Gravel', detail: 'Heavier, holds a little less, works the same way.', fraction: 0.08 },
  { id: 'none', label: 'No drainage', detail: 'Excess water stays in the soil. Risky in a closed jar.', fraction: 0 },
];

export const SUBSTRATES: (Option<SubstrateId> & { props: SubstrateProps; extraDetritus: number; color: string })[] = [
  { id: 'abg', label: 'ABG mix', detail: 'Bark, tree fern, charcoal and peat. Airy and fast draining: the vivarium standard.', props: { fieldCapacityGPerL: 300, humusGPerL: 120, nutrientMgPerL: 100, drainPerH: 0.6 }, extraDetritus: 0, color: '#5b4330' },
  { id: 'bioactive', label: 'Bioactive tropical mix', detail: 'Coir, peat, bark and worm castings. Holds more water, feeds plants and crew.', props: { fieldCapacityGPerL: 380, humusGPerL: 170, nutrientMgPerL: 140, drainPerH: 0.45 }, extraDetritus: 1, color: '#4a3526' },
  { id: 'peat', label: 'Peat and sphagnum', detail: 'A sponge. Mosses love it; roots can sour if it stays wet.', props: { fieldCapacityGPerL: 460, humusGPerL: 200, nutrientMgPerL: 80, drainPerH: 0.3 }, extraDetritus: 0, color: '#6b4b31' },
  { id: 'potting-soil', label: 'Bagged potting soil', detail: 'Dense and rich. Compacts, stays soggy, and grows more mold.', props: { fieldCapacityGPerL: 420, humusGPerL: 230, nutrientMgPerL: 240, drainPerH: 0.2 }, extraDetritus: 4, color: '#3d2f26' },
];

export const DEPTHS: (Option<DepthId> & { fraction: number })[] = [
  { id: 'shallow', label: 'Shallow', detail: 'More air space, less water held.', fraction: 0.12 },
  { id: 'standard', label: 'Standard', detail: 'About a fifth of the vessel.', fraction: 0.2 },
  { id: 'deep', label: 'Deep', detail: 'Room for roots and burrowers; holds more water.', fraction: 0.28 },
];

export const HARDSCAPE: (Option<HardscapeId> & { detritusPerL: number })[] = [
  { id: 'wood', label: 'Driftwood', detail: 'Molds at first, then feeds isopods for years.', detritusPerL: 2 },
  { id: 'stone', label: 'Stone', detail: 'Inert. Takes up a little air space.', detritusPerL: 0 },
  { id: 'leaf-litter', label: 'Leaf litter', detail: 'Food and cover for the clean-up crew.', detritusPerL: 5 },
];

export const PLACEMENTS: (Option<PlacementId> & { ppfd: number; hours: number })[] = [
  { id: 'dim-corner', label: 'Dim corner', detail: 'Far from any window.', ppfd: 10, hours: 10 },
  { id: 'north-window', label: 'North window', detail: 'Soft, even light all day.', ppfd: 45, hours: 10 },
  { id: 'east-window', label: 'East window', detail: 'Bright morning light, never harsh.', ppfd: 90, hours: 9 },
  { id: 'grow-light', label: 'Under a grow light', detail: 'On a timer, 12 hours a day.', ppfd: 120, hours: 12 },
  { id: 'south-window', label: 'Sunny windowsill', detail: 'Direct sun for part of the day.', ppfd: 650, hours: 6 },
];

export const GROW_LIGHTS: (Option<GrowLightId> & { ppfd: number })[] = [
  { id: 'low', label: 'Low', detail: 'Mosses and ferns.', ppfd: 60 },
  { id: 'medium', label: 'Medium', detail: 'Most tropical plants.', ppfd: 120 },
  { id: 'high', label: 'High', detail: 'Fast growth, more pruning.', ppfd: 200 },
];

export const ROOMS: (Option<RoomId> & { tempC: number })[] = [
  { id: 'cool', label: 'Cool room', detail: 'Around 18 °C.', tempC: 18 },
  { id: 'average', label: 'Average room', detail: 'Around 21 °C.', tempC: 21.5 },
  { id: 'warm', label: 'Warm room', detail: 'Around 25 °C.', tempC: 25 },
];

export const MOISTURES: (Option<MoistureId> & { fraction: number })[] = [
  { id: 'dry', label: 'On the dry side', detail: 'Crumbles when squeezed.', fraction: 0.45 },
  { id: 'damp', label: 'Damp', detail: 'Holds together, no water runs out.', fraction: 0.75 },
  { id: 'wet', label: 'Wet', detail: 'Water drips when squeezed.', fraction: 1.1 },
];

export const PLANT_SIZES: (Option<PlantSizeId> & { fraction: number })[] = [
  { id: 'plug', label: 'Cutting', detail: '', fraction: 0.06 },
  { id: 'small', label: 'Small', detail: '', fraction: 0.13 },
  { id: 'medium', label: 'Established', detail: '', fraction: 0.25 },
];

export const CREW_COUNTS: Record<string, number[]> = {
  springtail: [50, 150],
  'dwarf-white-isopod': [10, 20, 40],
  'rough-woodlouse': [5, 10],
};

/** Grams of fresh plant per litre a vessel can hold before everything is crowded (matches plants.ts). */
const CANOPY_G_PER_L = 12;

const find = <T extends { id: string }>(list: T[], id: string): T => {
  const x = list.find((o) => o.id === id);
  if (!x) throw new Error(`Unknown option ${id}`);
  return x;
};

export function lightFor(spec: Pick<TerrariumSpec, 'placement' | 'growLight'>) {
  const p = find(PLACEMENTS, spec.placement);
  return { ppfd: p.id === 'grow-light' ? find(GROW_LIGHTS, spec.growLight).ppfd : p.ppfd, hours: p.hours };
}

export function plantBiomass(speciesId: string, size: PlantSizeId): number {
  return plantSpecies(speciesId).maxBiomassG * find(PLANT_SIZES, size).fraction;
}

export function specToSetup(spec: TerrariumSpec): Setup {
  const v = find(VESSELS, spec.vessel);
  const sub = find(SUBSTRATES, spec.substrate);
  const light = lightFor(spec);
  const stoneL = spec.hardscape.includes('stone') ? 0.03 * spec.sizeL : 0;
  const substrateL = spec.sizeL * find(DEPTHS, spec.depth).fraction;
  const container: Container = {
    form: v.form,
    aspect: v.aspect,
    // Stone is inert: it only displaces air.
    volumeL: spec.sizeL - stoneL,
    substrateL,
    drainageL: spec.sizeL * find(DRAINAGE, spec.drainage).fraction,
    // The cloche always leaks a little under the rim.
    ventilation: Math.max(find(LIDS, spec.lid).vent * v.opening, spec.vessel === 'cloche' ? 0.02 : 0),
    light: { ppfd: light.ppfd, photoperiodH: light.hours },
    room: { tempC: find(ROOMS, spec.room).tempC, swingC: 2, rh: 0.45 },
    substrate: sub.props,
  };
  const detritusPerL = 8 + sub.extraDetritus + spec.hardscape.reduce((a, h) => a + find(HARDSCAPE, h).detritusPerL, 0);
  return {
    seed: spec.seed,
    container,
    initialMoisture: find(MOISTURES, spec.startMoisture).fraction,
    initialDetritusG: detritusPerL * substrateL,
    plants: spec.plants.map((p) => ({ speciesId: p.speciesId, biomassG: plantBiomass(p.speciesId, p.size) })),
    fauna: spec.fauna.filter((f) => f.count > 0),
  };
}

export function buildTerrarium(spec: TerrariumSpec): TerrariumState {
  return createTerrarium(specToSetup(spec));
}

// ---------------------------------------------------------------- checks

export interface SpecIssue {
  severity: 'info' | 'warn' | 'critical';
  /** What the issue is attached to: a plant/fauna species id, or a section of the builder. */
  target: string;
  message: string;
}

/** Static compatibility checks: things a knowledgeable keeper would tell you before you build. */
export function checkSpec(spec: TerrariumSpec): SpecIssue[] {
  const out: SpecIssue[] = [];
  const light = lightFor(spec);
  const lid = find(LIDS, spec.lid);
  const closed = lid.vent < 0.1;
  const room = find(ROOMS, spec.room);

  if (spec.placement === 'south-window' && closed)
    out.push({ severity: 'critical', target: 'placement', message: 'A closed vessel in direct sun works like a greenhouse and overheats.' });
  if (spec.drainage === 'none' && closed)
    out.push({ severity: 'warn', target: 'drainage', message: 'With no drainage layer, any extra water sits around the roots.' });
  if (spec.substrate === 'potting-soil')
    out.push({ severity: 'warn', target: 'substrate', message: 'Bagged soil compacts and stays wet. Expect more mold and possibly fungus gnats.' });
  if (spec.lid === 'open')
    out.push({ severity: 'info', target: 'lid', message: 'An open top dries out. Plan to mist every few days.' });
  if (spec.startMoisture === 'wet' && closed)
    out.push({ severity: 'warn', target: 'moisture', message: 'Starting wet in a closed vessel is the most common beginner mistake.' });

  const startG = spec.plants.reduce((a, p) => a + plantBiomass(p.speciesId, p.size), 0);
  const capacity = spec.sizeL * CANOPY_G_PER_L;
  if (startG > 0.6 * capacity)
    out.push({ severity: 'warn', target: 'plants', message: 'Crowded from day one. Plants will compete for room and light.' });
  if (spec.plants.length === 0)
    out.push({ severity: 'info', target: 'plants', message: 'No plants yet.' });

  const seen = new Set<string>();
  for (const p of spec.plants) {
    if (seen.has(p.speciesId)) continue;
    seen.add(p.speciesId);
    const sp = plantSpecies(p.speciesId);
    const avg = (light.ppfd * light.hours) / 12;
    if (avg < sp.light.comp * 2.2)
      out.push({ severity: 'warn', target: p.speciesId, message: `${sp.commonName} needs more light than this spot gives.` });
    if (light.ppfd > sp.light.max)
      out.push({ severity: 'critical', target: p.speciesId, message: `Direct sun will scorch ${sp.commonName.toLowerCase()}.` });
    if (!closed && sp.rhMin >= 0.7)
      out.push({ severity: 'warn', target: p.speciesId, message: `${sp.commonName} needs the humidity of a closed lid.` });
    if (room.tempC < sp.tempC.min + 4)
      out.push({ severity: 'warn', target: p.speciesId, message: `A cool room is near the bottom of ${sp.commonName.toLowerCase()}'s range.` });
    if (sp.rgrPerDay >= 0.03 && spec.sizeL <= 6)
      out.push({ severity: 'info', target: p.speciesId, message: `${sp.commonName} grows fast. In a vessel this size it will need regular pruning.` });
    if (sp.moisture.max <= 1.05 && spec.drainage === 'none')
      out.push({ severity: 'warn', target: p.speciesId, message: `${sp.commonName} browns and rots if it sits wet.` });
  }

  for (const f of spec.fauna) {
    if (f.count <= 0) continue;
    const sp = faunaSpecies(f.speciesId);
    if (f.speciesId === 'rough-woodlouse' && spec.sizeL < 12)
      out.push({ severity: 'warn', target: f.speciesId, message: 'Big appetites for a small vessel. They will need regular feeding or start on the plants.' });
    if (spec.lid === 'open' && sp.moisture.min >= 0.25)
      out.push({ severity: 'warn', target: f.speciesId, message: `${sp.commonName}s need damp soil. An open top makes that hard to keep.` });
    if (spec.sizeL <= 1 && f.speciesId !== 'springtail')
      out.push({ severity: 'info', target: f.speciesId, message: 'A mini jar is a tight squeeze. Springtails alone are usually enough.' });
  }
  if (!spec.fauna.some((f) => f.speciesId === 'springtail' && f.count > 0) && spec.plants.length > 0)
    out.push({ severity: 'info', target: 'fauna', message: 'Without springtails, the first-month mold bloom tends to linger.' });

  return out;
}

// ---------------------------------------------------------------- forecast

export interface Forecast {
  days: number;
  scores: number[];
  finalScore: number;
  plantsAlive: number;
  plantsStart: number;
  moldPeakDay: number | null;
  headlines: string[];
}

/** Run the design forward in time so the builder can show where it is heading. */
export function forecast(spec: TerrariumSpec, days = 90): Forecast {
  const s = buildTerrarium(spec);
  const scores: number[] = [];
  let moldPeak = 0;
  let moldPeakDay: number | null = null;
  const visible = 0.1 * s.container.substrateL;
  for (let d = 0; d < days; d++) {
    run(s, 24);
    scores.push(healthScore(s));
    if (s.pools.moldG > Math.max(moldPeak, visible)) {
      moldPeak = s.pools.moldG;
      moldPeakDay = d + 1;
    }
  }
  const headlines: string[] = [];
  const notable = s.events.filter((e) => e.type === 'plant-death' || e.type === 'invasion' || e.type === 'extinction');
  for (const e of notable.slice(0, 4)) headlines.push(`Day ${Math.floor(e.hour / 24)}: ${e.message}`);
  if (notable.length > 4) headlines.push(`${notable.length - 4} more losses after that.`);
  if (moldPeakDay !== null) {
    const cleared = s.pools.moldG < visible;
    headlines.push(cleared ? `Mold blooms around day ${moldPeakDay}, then clears.` : `Mold blooms around day ${moldPeakDay} and is still visible at day ${days}.`);
  }
  const springtails = s.fauna.find((f) => f.speciesId === 'springtail');
  if (springtails) headlines.push(`About ${Math.round((springtails.juveniles + springtails.adults) / 10) * 10} springtails by day ${days}.`);
  const fast = s.plants.find((p) => p.biomassG > 0.85 * plantSpecies(p.speciesId).maxBiomassG);
  if (fast) headlines.push(`${plantSpecies(fast.speciesId).commonName} will need pruning.`);
  if (headlines.length === 0) headlines.push('A quiet, stable first three months.');

  return {
    days,
    scores,
    finalScore: scores[scores.length - 1] ?? 0,
    plantsAlive: s.plants.length,
    plantsStart: spec.plants.length,
    moldPeakDay,
    headlines,
  };
}

// ---------------------------------------------------------------- recipes

export const BLANK_SPEC: TerrariumSpec = {
  name: 'Untitled terrarium',
  vessel: 'jar', sizeL: 6, lid: 'sealed', drainage: 'leca', substrate: 'abg', depth: 'standard',
  hardscape: [], plants: [], fauna: [], placement: 'east-window', growLight: 'medium', room: 'average',
  startMoisture: 'damp', seed: 1,
};

export const RECIPES: { id: string; label: string; detail: string; spec: TerrariumSpec }[] = [
  {
    id: 'tropical-jar', label: 'Classic tropical jar', detail: 'Nerve plant, creeping fig and moss with a full clean-up crew.',
    spec: {
      ...BLANK_SPEC, name: 'Tropical jar', vessel: 'jar', sizeL: 12, hardscape: ['wood', 'leaf-litter'],
      plants: [
        { speciesId: 'fittonia', size: 'small' }, { speciesId: 'creeping-fig', size: 'plug' },
        { speciesId: 'baby-tears-pilea', size: 'plug' }, { speciesId: 'spike-moss', size: 'small' },
        { speciesId: 'cushion-moss', size: 'small' },
      ],
      fauna: [{ speciesId: 'springtail', count: 50 }, { speciesId: 'dwarf-white-isopod', count: 20 }],
      placement: 'grow-light',
    },
  },
  {
    id: 'mossy-woodland', label: 'Mossy woodland', detail: 'Low light, cushion moss and a maidenhair fern, with woodlice to watch.',
    spec: {
      ...BLANK_SPEC, name: 'Mossy woodland', vessel: 'cube', sizeL: 25, lid: 'cork', substrate: 'bioactive',
      hardscape: ['stone', 'wood', 'leaf-litter'],
      plants: [
        { speciesId: 'cushion-moss', size: 'medium' }, { speciesId: 'maidenhair-fern', size: 'small' },
        { speciesId: 'spike-moss', size: 'small' },
      ],
      fauna: [{ speciesId: 'springtail', count: 50 }, { speciesId: 'rough-woodlouse', count: 10 }],
      placement: 'north-window', room: 'cool',
    },
  },
  {
    id: 'bottle-garden', label: 'Sealed bottle garden', detail: 'One narrow-necked bottle, sealed and left alone.',
    spec: {
      ...BLANK_SPEC, name: 'Bottle garden', vessel: 'bottle', sizeL: 6, lid: 'cork', substrate: 'bioactive',
      plants: [{ speciesId: 'fittonia', size: 'plug' }, { speciesId: 'cushion-moss', size: 'small' }],
      fauna: [{ speciesId: 'springtail', count: 50 }],
      placement: 'east-window',
    },
  },
];

export const PLANT_IDS = Object.values(SPECIES).filter((s) => s.kind === 'plant').map((s) => s.id);
export const CREW_IDS = Object.values(SPECIES).filter((s) => s.kind === 'fauna' && s.role === 'cleanup').map((s) => s.id);
export { CONFIG };
