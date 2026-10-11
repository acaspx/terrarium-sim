import type { FaunaSpecies, PlantSpecies, Species } from '../core/types.js';

/**
 * Species catalog. Parameters are data, not code: add an organism by adding
 * an entry here. `confidence` says how much to trust the numbers:
 *   literature  - life-history values from published lab studies
 *   care-sheet  - ranges from keeper/vendor care guides
 *   estimated   - reasoned guesses awaiting calibration
 * Sources and caveats: docs/RESEARCH.md.
 */

const plants: PlantSpecies[] = [
  {
    kind: 'plant', id: 'fittonia', commonName: 'Nerve plant', scientificName: 'Fittonia albivenis',
    form: 'upright',
    light: { comp: 15, opt: 120, max: 400 },
    tempC: { min: 13, opt: 24, max: 32 },
    moisture: { min: 0.3, optLow: 0.5, optHigh: 0.9, max: 1.2 },
    rhMin: 0.6, rgrPerDay: 0.02, maxBiomassG: 60, transpiration: 0.06, litterPerDay: 0.002,
    wiltPerDay: 2.5, recoverPerDay: 4, declinePerDay: 0.06, heightCm: 15, pH: { min: 5.5, max: 7 },
    confidence: 'care-sheet',
    notes: 'Veined leaves in green, pink or white. Collapses within a day of drying out and stands back up hours after a drink.',
  },
  {
    kind: 'plant', id: 'creeping-fig', commonName: 'Creeping fig', scientificName: 'Ficus pumila',
    form: 'creeper',
    light: { comp: 10, opt: 150, max: 500 },
    tempC: { min: 10, opt: 24, max: 34 },
    moisture: { min: 0.25, optLow: 0.45, optHigh: 0.9, max: 1.2 },
    rhMin: 0.5, rgrPerDay: 0.035, maxBiomassG: 150, transpiration: 0.05, litterPerDay: 0.0015,
    wiltPerDay: 0.6, recoverPerDay: 1, declinePerDay: 0.04, heightCm: 8, pH: { min: 5.5, max: 7.5 },
    confidence: 'care-sheet',
    notes: 'Small leaves on running stems. Grows fast, climbs the glass, and crowds out neighbours unless pruned.',
  },
  {
    kind: 'plant', id: 'baby-tears-pilea', commonName: 'Baby tears pilea', scientificName: 'Pilea depressa',
    form: 'creeper',
    light: { comp: 15, opt: 130, max: 400 },
    tempC: { min: 13, opt: 23, max: 32 },
    moisture: { min: 0.3, optLow: 0.5, optHigh: 0.85, max: 1.15 },
    rhMin: 0.6, rgrPerDay: 0.028, maxBiomassG: 50, transpiration: 0.05, litterPerDay: 0.002,
    wiltPerDay: 0.9, recoverPerDay: 1.5, declinePerDay: 0.05, heightCm: 5, pH: { min: 5.5, max: 7 },
    confidence: 'care-sheet',
    notes: 'A low carpet of tiny round leaves. Keeps a small jar looking in scale.',
  },
  {
    kind: 'plant', id: 'spike-moss', commonName: 'Spike moss', scientificName: 'Selaginella kraussiana',
    form: 'creeper',
    light: { comp: 8, opt: 70, max: 250 },
    tempC: { min: 10, opt: 22, max: 30 },
    moisture: { min: 0.45, optLow: 0.6, optHigh: 0.95, max: 1.2 },
    rhMin: 0.75, rgrPerDay: 0.02, maxBiomassG: 40, transpiration: 0.04, litterPerDay: 0.002,
    wiltPerDay: 1.5, recoverPerDay: 0.8, declinePerDay: 0.1, heightCm: 6, pH: { min: 5, max: 7 },
    confidence: 'care-sheet',
    notes: 'Feathery, fern-like ground cover. Needs constant moisture: crisps fast and recovers slowly if the jar dries.',
  },
  {
    kind: 'plant', id: 'cushion-moss', commonName: 'Cushion moss', scientificName: 'Leucobryum glaucum',
    form: 'moss',
    light: { comp: 5, opt: 60, max: 250 },
    tempC: { min: 2, opt: 20, max: 30 },
    moisture: { min: 0.3, optLow: 0.5, optHigh: 0.8, max: 1.05 },
    rhMin: 0.8, rgrPerDay: 0.006, maxBiomassG: 80, transpiration: 0.02, litterPerDay: 0.0008,
    wiltPerDay: 0.5, recoverPerDay: 2, declinePerDay: 0.03, heightCm: 6, pH: { min: 4, max: 5.8 },
    confidence: 'estimated',
    notes: 'Soft blue-green domes. Very slow and happy in shade. Browns if it sits waterlogged.',
  },
  {
    kind: 'plant', id: 'maidenhair-fern', commonName: 'Maidenhair fern', scientificName: 'Adiantum raddianum',
    form: 'fern',
    light: { comp: 12, opt: 100, max: 300 },
    tempC: { min: 12, opt: 22, max: 30 },
    moisture: { min: 0.4, optLow: 0.55, optHigh: 0.9, max: 1.15 },
    rhMin: 0.7, rgrPerDay: 0.018, maxBiomassG: 90, transpiration: 0.07, litterPerDay: 0.003,
    wiltPerDay: 2, recoverPerDay: 0.5, declinePerDay: 0.12, heightCm: 30, pH: { min: 6, max: 8 },
    confidence: 'care-sheet',
    notes: 'Delicate fronds on black stems. Beautiful under glass, unforgiving of a single dry spell. Likes a little lime.',
  },
  {
    kind: 'plant', id: 'birds-nest-fern', commonName: "Bird's nest fern", scientificName: 'Asplenium nidus',
    form: 'fern',
    light: { comp: 10, opt: 110, max: 350 },
    tempC: { min: 15, opt: 24, max: 32 },
    moisture: { min: 0.4, optLow: 0.55, optHigh: 0.9, max: 1.1 },
    rhMin: 0.6, rgrPerDay: 0.012, maxBiomassG: 160, transpiration: 0.05, litterPerDay: 0.0015,
    wiltPerDay: 0.8, recoverPerDay: 0.8, declinePerDay: 0.06, heightCm: 35, pH: { min: 5, max: 6.5 },
    confidence: 'care-sheet',
    notes: 'Glossy, wavy strap fronds rising from a nest-like crown. Slow and sculptural: a centrepiece for a big case, and it shades whatever grows beneath it.',
  },
  {
    kind: 'plant', id: 'lemon-button-fern', commonName: 'Lemon button fern', scientificName: "Nephrolepis cordifolia 'Duffii'",
    form: 'fern',
    light: { comp: 10, opt: 100, max: 300 },
    tempC: { min: 12, opt: 22, max: 30 },
    moisture: { min: 0.4, optLow: 0.55, optHigh: 0.9, max: 1.15 },
    rhMin: 0.6, rgrPerDay: 0.02, maxBiomassG: 70, transpiration: 0.06, litterPerDay: 0.0025,
    wiltPerDay: 1.2, recoverPerDay: 1, declinePerDay: 0.08, heightCm: 25, pH: { min: 5, max: 6.5 },
    confidence: 'care-sheet',
    notes: 'Upright fronds lined with small round leaflets. A compact, forgiving fern for a medium jar.',
  },
];

const fauna: FaunaSpecies[] = [
  {
    kind: 'fauna', id: 'springtail', commonName: 'Springtail', scientificName: 'Folsomia candida',
    role: 'cleanup',
    tempC: { min: 5, opt: 21, max: 30 },
    moisture: { min: 0.25, opt: 0.55, max: 1.35 },
    eggDays: 9, juvenileDays: 16, adultLifespanDays: 75, fecundityPerDay: 1.5,
    intakeG: { juvenile: 0.00002, adult: 0.00005 },
    diet: { mold: 1, detritus: 0.25, plant: 0 },
    densityPerL: 3000,
    confidence: 'literature',
    notes: 'Tiny white hoppers that graze mold. They boom while a jar is new, then settle as the mold runs out. Die quickly in dry soil.',
  },
  {
    kind: 'fauna', id: 'dwarf-white-isopod', commonName: 'Dwarf white isopod', scientificName: 'Trichorhina tomentosa',
    role: 'cleanup',
    tempC: { min: 14, opt: 26, max: 33 },
    moisture: { min: 0.4, opt: 0.7, max: 1.25 },
    eggDays: 25, juvenileDays: 60, adultLifespanDays: 365, fecundityPerDay: 0.35,
    intakeG: { juvenile: 0.0002, adult: 0.0005 },
    diet: { mold: 0.3, detritus: 1, plant: 0 },
    densityPerL: 400,
    confidence: 'care-sheet',
    notes: 'Tiny white isopods that burrow, shred leaf litter and keep the soil loose. Slow to build up, mostly out of sight.',
  },
  {
    kind: 'fauna', id: 'rough-woodlouse', commonName: 'Rough woodlouse', scientificName: 'Porcellio scaber',
    role: 'cleanup',
    tempC: { min: 5, opt: 22, max: 31 },
    moisture: { min: 0.2, opt: 0.5, max: 1.1 },
    eggDays: 28, juvenileDays: 110, adultLifespanDays: 800, fecundityPerDay: 0.1,
    intakeG: { juvenile: 0.002, adult: 0.008 },
    diet: { mold: 0.3, detritus: 1, plant: 0.15 },
    densityPerL: 40,
    confidence: 'care-sheet',
    notes: 'Big, visible isopods that come out at night. Huge appetites: keep leaf litter in or they start on the plants.',
  },
  {
    kind: 'fauna', id: 'dairy-cow-isopod', commonName: 'Dairy cow isopod', scientificName: "Porcellio laevis 'Dairy Cow'",
    role: 'cleanup',
    tempC: { min: 10, opt: 26, max: 32 },
    moisture: { min: 0.25, opt: 0.5, max: 1.1 },
    eggDays: 25, juvenileDays: 70, adultLifespanDays: 500, fecundityPerDay: 0.25,
    intakeG: { juvenile: 0.003, adult: 0.01 },
    diet: { mold: 0.3, detritus: 1, plant: 0.25 },
    densityPerL: 25,
    confidence: 'care-sheet',
    notes: 'Large, quick and boldly patched black and white. Breeds fast and eats a lot: in a small jar they turn to the plants.',
  },
  {
    kind: 'fauna', id: 'rubber-ducky-isopod', commonName: 'Rubber ducky isopod', scientificName: "Cubaris sp. 'Rubber Ducky'",
    role: 'cleanup',
    tempC: { min: 18, opt: 25, max: 30 },
    moisture: { min: 0.45, opt: 0.75, max: 1.25 },
    eggDays: 30, juvenileDays: 120, adultLifespanDays: 700, fecundityPerDay: 0.05,
    intakeG: { juvenile: 0.0006, adult: 0.002 },
    diet: { mold: 0.4, detritus: 1, plant: 0 },
    densityPerL: 30,
    confidence: 'estimated',
    notes: 'A collector favourite with a yellow, duck-like face. Slow to breed and fussy: wants warmth, high humidity and damp soil.',
  },
  {
    kind: 'fauna', id: 'magic-potion-isopod', commonName: 'Magic potion isopod', scientificName: "Armadillidium vulgare 'Magic Potion'",
    role: 'cleanup',
    tempC: { min: 8, opt: 24, max: 31 },
    moisture: { min: 0.2, opt: 0.45, max: 1.05 },
    eggDays: 25, juvenileDays: 90, adultLifespanDays: 700, fecundityPerDay: 0.12,
    intakeG: { juvenile: 0.0015, adult: 0.006 },
    diet: { mold: 0.3, detritus: 1, plant: 0.1 },
    densityPerL: 35,
    confidence: 'care-sheet',
    notes: 'A pill bug in deep blue-grey flecked with orange. Rolls into a ball when disturbed and copes with a drier jar than most isopods.',
  },
  {
    kind: 'fauna', id: 'fungus-gnat', commonName: 'Fungus gnat', scientificName: 'Bradysia sp.',
    role: 'pest',
    tempC: { min: 10, opt: 24, max: 33 },
    moisture: { min: 0.7, opt: 1.0, max: 1.6 },
    eggDays: 4, juvenileDays: 14, adultLifespanDays: 7, fecundityPerDay: 8,
    intakeG: { juvenile: 0.0003, adult: 0 },
    diet: { mold: 1, detritus: 0.3, plant: 0.3 },
    densityPerL: 200,
    confidence: 'estimated',
    notes: 'Uninvited. Breeds in soil that stays soggy and moldy. Larvae nibble roots.',
  },
];

export const SPECIES: Record<string, Species> = Object.fromEntries(
  [...plants, ...fauna].map((s) => [s.id, s]),
);

export function plantSpecies(id: string): PlantSpecies {
  const s = SPECIES[id];
  if (!s || s.kind !== 'plant') throw new Error(`Unknown plant species: ${id}`);
  return s;
}
export function faunaSpecies(id: string): FaunaSpecies {
  const s = SPECIES[id];
  if (!s || s.kind !== 'fauna') throw new Error(`Unknown fauna species: ${id}`);
  return s;
}
