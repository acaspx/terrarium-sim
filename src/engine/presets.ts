import type { Container } from './core/types.js';
import type { Setup } from './sim/terrarium.js';

const jar10L: Container = {
  volumeL: 10, substrateL: 2, drainageL: 0.8, ventilation: 0,
  light: { ppfd: 120, photoperiodH: 12 }, // bright indirect light or a small LED
  room: { tempC: 21.5, swingC: 2, rh: 0.45 },
};

export const PRESETS: Record<string, Setup> = {
  /** The classic: sealed tropical jar with a full clean-up crew. */
  'tropical-jar': {
    container: jar10L,
    plants: [
      { speciesId: 'fittonia', biomassG: 8 },
      { speciesId: 'creeping-fig', biomassG: 5 },
      { speciesId: 'baby-tears-pilea', biomassG: 4 },
      { speciesId: 'spike-moss', biomassG: 5 },
      { speciesId: 'cushion-moss', biomassG: 12 },
    ],
    fauna: [
      { speciesId: 'springtail', count: 50 },
      { speciesId: 'dwarf-white-isopod', count: 20 },
    ],
  },
  /** Same jar, no clean-up crew. Run both to see what the crew is worth. */
  'no-crew': {
    container: jar10L,
    plants: [
      { speciesId: 'fittonia', biomassG: 8 },
      { speciesId: 'creeping-fig', biomassG: 5 },
      { speciesId: 'baby-tears-pilea', biomassG: 4 },
      { speciesId: 'spike-moss', biomassG: 5 },
      { speciesId: 'cushion-moss', biomassG: 12 },
    ],
  },
  /** Beginner mistake: soaked substrate on a sunny windowsill. */
  'overwatered-windowsill': {
    container: { ...jar10L, light: { ppfd: 700, photoperiodH: 6, sun: true } },
    initialMoisture: 1.3,
    plants: [
      { speciesId: 'fittonia', biomassG: 8 },
      { speciesId: 'cushion-moss', biomassG: 12 },
    ],
  },
  /** Low-light moss and fern jar with showy isopods. */
  'mossy-woodland': {
    container: { ...jar10L, light: { ppfd: 70, photoperiodH: 12 }, ventilation: 0.05 },
    plants: [
      { speciesId: 'cushion-moss', biomassG: 20 },
      { speciesId: 'maidenhair-fern', biomassG: 8 },
      { speciesId: 'spike-moss', biomassG: 5 },
    ],
    fauna: [
      { speciesId: 'springtail', count: 50 },
      { speciesId: 'rough-woodlouse', count: 8 },
    ],
  },
};
