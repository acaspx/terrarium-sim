import type { ThermalRange } from './math.js';

/** How well grounded a species' parameters are. See docs/RESEARCH.md. */
export type Confidence = 'literature' | 'care-sheet' | 'estimated';

export interface PlantSpecies {
  kind: 'plant';
  id: string;
  commonName: string;
  scientificName: string;
  form: 'upright' | 'creeper' | 'moss' | 'fern';
  /** Light response in PPFD (umol/m2/s): compensation point, saturation, scorch threshold. */
  light: { comp: number; opt: number; max: number };
  tempC: ThermalRange;
  /** Substrate moisture as a fraction of field capacity (1.0 = field capacity, >1 = waterlogged). */
  moisture: { min: number; optLow: number; optHigh: number; max: number };
  /** Relative humidity below which the plant is stressed (0..1). */
  rhMin: number;
  /** Max relative growth rate per day at saturating light, 12 h photoperiod. */
  rgrPerDay: number;
  maxBiomassG: number;
  /** g water per g fresh biomass per hour at full vapour-pressure deficit, in light. */
  transpiration: number;
  /** Fraction of biomass shed as litter per day. */
  litterPerDay: number;
  /** How fast turgor is lost when dry / regained when watered (per day). Fittonia "faints". */
  wiltPerDay: number;
  recoverPerDay: number;
  /** Health lost per day under severe stress. */
  declinePerDay: number;
  /** Height at full size. Taller plants shade shorter neighbours (see plants.ts). */
  heightCm: number;
  /** Substrate pH the plant grows well in. Outside it, growth slows; it does not die of it. */
  pH: { min: number; max: number };
  confidence: Confidence;
  notes: string;
}

export interface FaunaSpecies {
  kind: 'fauna';
  id: string;
  commonName: string;
  scientificName: string;
  role: 'cleanup' | 'pest';
  tempC: ThermalRange;
  /** Substrate moisture response: dead-dry below min, fine above opt, drowning above max. */
  moisture: { min: number; opt: number; max: number };
  eggDays: number;       // egg (or brood-pouch) duration at optimum
  juvenileDays: number;  // hatch to maturity at optimum
  adultLifespanDays: number;
  /** Eggs (or mancae) per adult per day at optimum, well fed. */
  fecundityPerDay: number;
  /** Food intake in grams per individual per day. */
  intakeG: { juvenile: number; adult: number };
  /** Relative preference for each food pool. `plant` is only eaten when hungry. */
  diet: { mold: number; detritus: number; plant: number };
  /** Soft carrying capacity, individuals per litre of substrate. */
  densityPerL: number;
  confidence: Confidence;
  notes: string;
}

export type Species = PlantSpecies | FaunaSpecies;

export interface PlantState {
  id: string;
  speciesId: string;
  biomassG: number;
  health: number;   // 0..1, slow-moving; 0 = dead
  turgor: number;   // 0..1, fast-moving; visible wilting
  lightEma: number; // running mean of hourly light factor
  /** Where it is planted on the floor of the vessel: u, v in [-1, 1] (x left-right, v back (-1) to front (1)). */
  at?: [number, number];
  /** Share of light taken by taller neighbours, last hour (0..1). */
  shade?: number;
}

export interface FaunaState {
  speciesId: string;
  eggs: number;
  juveniles: number;
  adults: number;
}

/** Physical character of the growing medium. Different mixes hold and shed water very differently. */
export interface SubstrateProps {
  /** g water held per litre at field capacity. */
  fieldCapacityGPerL: number;
  /** Slow organic matter per litre (g dry): long-run CO2 and nitrogen supply. */
  humusGPerL: number;
  /** Plant-available nitrogen per litre at setup (mg). */
  nutrientMgPerL: number;
  /** Fraction of excess water that drains to the false bottom each hour. */
  drainPerH: number;
  /** Starting pH of the mix. */
  pH?: number;
}

export interface Container {
  /** Footprint and proportion; default is a round jar 1.5x taller than wide. */
  form?: 'round' | 'square';
  aspect?: number;
  substrate?: SubstrateProps;
  volumeL: number;
  substrateL: number;
  drainageL: number;
  /** 0 = sealed, 1 = lid fully off. */
  ventilation: number;
  light: { ppfd: number; photoperiodH: number };
  room: { tempC: number; swingC: number; rh: number };
}

export interface Pools {
  substrateWaterG: number;
  reservoirWaterG: number;
  condensationG: number;
  co2Mg: number;
  /** Fresh, labile dead matter: leaf litter, dead plants, frass. Food for mold and the clean-up crew. */
  detritusG: number;
  /** Slow organic fraction of the substrate itself (bark, coir, peat). Baseline CO2 and nitrogen supply. */
  humusG: number;
  nutrientMg: number;
  moldG: number;
  /** Driftwood (g dry). Rots very slowly and feeds the fungi that fruit as mushrooms. */
  woodG?: number;
  /** Fungal threads living in the wood, unseen until they fruit. */
  myceliumG?: number;
  /** Mushrooms standing in the jar right now (g fresh). */
  mushroomG?: number;
}

export interface Climate {
  hourOfDay: number;
  lightOn: boolean;
  ppfd: number;
  roomTempC: number;
  airTempC: number;
  glassTempC: number;
  rh: number;
  moisture: number;
  co2Ppm: number;
  /** 0 = clear glass, ~0.5 = light mist, >1 = streaming wet. */
  condensationIndex: number;
  /** Vapour pressure deficit of the air, kPa: how hard the air pulls water from leaves. */
  vpdKPa: number;
}

/** The substrate as roots experience it. */
export interface Soil {
  pH: number;
  /** 1 = open, well-aired soil; 0 = waterlogged and anaerobic ("sour"). */
  air: number;
}

export interface SimEvent { hour: number; type: string; message: string; subject?: string }

export interface Alert { severity: 'info' | 'warn' | 'critical'; code: string; message: string; fix: string }

export interface TerrariumState {
  hour: number;
  seed: number;
  container: Container;
  interiorTempC: number;
  pools: Pools;
  plants: PlantState[];
  fauna: FaunaState[];
  climate: Climate;
  events: SimEvent[];
  /** Cumulative water in/out, for mass-balance checks. */
  waterLostG: number;
  waterAddedG: number;
  waterloggedHours: number;
  /** Counter for stable plant ids across save/load. */
  nextId: number;
  /** Plants ever added, so losses count against health. */
  planted?: number;
  /** Set by airOut(): restore this ventilation at this hour. */
  ventRevert?: { hour: number; ventilation: number };
  /** Optional so jars saved before these existed still load; step() fills them in. */
  soil?: Soil;
  /** Mushroom flushes: when the current one started (-1 if none) and when the last one ended. */
  fungi?: { flushStartHour: number; lastFlushHour: number };
}
