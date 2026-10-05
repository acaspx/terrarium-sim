/**
 * Physical and calibration constants. Everything tunable lives here so the
 * model can be recalibrated against a real jar (see docs/MODEL.md, "Calibration").
 */
export const CONFIG = {
  lightsOnHour: 8,
  /** deg C of interior warming per unit PPFD under a closed lid. 150 PPFD ~ +2 C; direct sun (1000+) cooks the jar. */
  heatPerPpfd: 0.015,
  /** Interior air/substrate relaxes toward its target temperature at this rate per hour. */
  thermalLagPerH: 0.3,
  /** g water evaporated per m2 of substrate per hour per unit (1 - RH). */
  evapCoeff: 250,
  /** Fraction of condensation film that runs back to the substrate each hour. */
  runoffPerH: 0.25,
  /** g of film per m2 of glass that reads as condensationIndex = 1. */
  filmPerM2AtIndex1: 40,
  /** Field capacity: g water held per litre of substrate. */
  fieldCapacityGPerL: 350,
  reservoirGPerL: 400,
  drainPerH: 0.5,
  wickPerH: 0.01,
  /** Even "sealed" jars exchange a little gas through cork/lid seams. Air changes per hour. */
  gasLeakPerH: 0.25,
  ventAirChangesPerH: 4,
  ambientCo2Ppm: 420,
  co2HalfSatPpm: 150,
  /** mg CO2 per litre of air per 1000 ppm. */
  co2MgPerLPer1000Ppm: 1.8,
  /** Fresh plant biomass -> dry matter. */
  dryFraction: 0.12,
  co2MgPerGDry: 1600,
  nitrogenMgPerGFresh: 3,
  nutrientHalfSatMg: 40,
  /** Microbial decomposition of detritus, per day at optimum temperature and moisture. */
  decompPerDay: 0.006,
  /** Slow decay of the substrate's own organic matter, per day. */
  humusDecompPerDay: 0.0005,
  humusGPerL: 150,
  /** Fraction of decomposed carbon respired (rest becomes stable humus). */
  respiredFraction: 0.5,
  nitrogenMgPerGDetritus: 10,
  mold: {
    growthPerDay: 0.45,
    deathPerDay: 0.04,
    /** Mold can reach at most this fraction of the detritus mass. */
    capPerGDetritus: 0.05,
    detritusPerGMold: 2,
    minMoisture: 0.45,
    minRh: 0.7,
    sporeFloorG: 0.002,
  },
} as const;
