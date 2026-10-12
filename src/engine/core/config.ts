/**
 * Physical and calibration constants. Everything tunable lives here so the
 * model can be recalibrated against a real jar (see docs/MODEL.md, "Calibration").
 */
export const CONFIG = {
  lightsOnHour: 8,
  /** deg C of interior warming per unit PPFD under a closed lid, from a grow light. 150 PPFD ~ +2 C. */
  heatPerPpfd: 0.015,
  /**
   * The same for daylight. Only about 45% of sunlight's energy is in the band plants use;
   * the rest is mostly infrared, which still heats the jar. A white LED puts most of its
   * output into that band. So sun warms a jar about twice as much for the same plant light,
   * which is why a closed jar on a sunny sill cooks.
   */
  heatPerPpfdSun: 0.03,
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
  /** pH units lost per g of organic matter decayed per litre of substrate (organic acids). */
  acidPerGPerL: 0.02,
  /** Daily pull of pH back toward the mix's own buffer value. */
  pHBufferPerDay: 0.002,
  /** Soil air relaxes toward its target: slowly when drowning, faster when draining. */
  soilAirLossPerH: 1 / 18,
  soilAirGainPerH: 1 / 6,
  fungi: {
    /** Mycelium growth per day at optimum, logistic toward the wood's capacity. */
    growthPerDay: 0.15,
    capPerGWood: 0.01,
    /** Share of capacity present on day one (wood arrives already colonised). */
    startShare: 0.02,
    woodDecayPerDay: 0.0004,
    /** Fruiting needs a well-colonised log, saturated air and wet wood. */
    fruitAtShare: 0.5,
    fruitMinRh: 0.85,
    fruitMinMoisture: 0.55,
    flushDays: 5,
    restDays: 45,
    mushroomPerGMycelium: 0.3,
  },
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
