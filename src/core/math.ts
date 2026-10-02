export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Saturation vapour density of air in g/m^3 (Magnus formula). */
export function satVaporDensity(tempC: number): number {
  const es = 6.112 * Math.exp((17.62 * tempC) / (243.12 + tempC)); // hPa
  return (216.7 * es) / (tempC + 273.15);
}

export interface ThermalRange { min: number; opt: number; max: number }

/**
 * Thermal performance curve: 0 at min and max, 1 at opt, asymmetric
 * (performance collapses faster above the optimum than below it).
 * Cardinal temperature model (Lobry-Rosso-Flandrois), the same family used
 * in the 2026 ALMaSS Folsomia candida population model.
 */
export function thermalPerformance(t: number, r: ThermalRange): number {
  if (t <= r.min || t >= r.max) return 0;
  const num = (t - r.max) * (t - r.min) ** 2;
  const den =
    (r.opt - r.min) *
    ((r.opt - r.min) * (t - r.opt) - (r.opt - r.max) * (r.opt + r.min - 2 * t));
  return clamp(num / den);
}

/** Trapezoid response: 0 below min, 1 across [optLow, optHigh], 0 above max. */
export function trapezoid(x: number, min: number, optLow: number, optHigh: number, max: number): number {
  if (x <= min || x >= max) return 0;
  if (x < optLow) return (x - min) / (optLow - min);
  if (x > optHigh) return (max - x) / (max - optHigh);
  return 1;
}

/** Deterministic seeded RNG (mulberry32) so runs are reproducible. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
