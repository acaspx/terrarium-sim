import { alerts, type Alert, type TerrariumState } from '../engine/index.js';

export const dayOf = (s: TerrariumState) => Math.floor(s.hour / 24);

export function clockOf(s: TerrariumState) {
  const h = s.hour % 24;
  return `${String(h).padStart(2, '0')}:00`;
}

export function glassWord(index: number) {
  if (index < 0.08) return 'Clear';
  if (index < 0.6) return 'Light mist';
  if (index < 1) return 'Fogged';
  return 'Streaming';
}

export function moistureWord(m: number) {
  if (m < 0.3) return 'Dry';
  if (m < 0.5) return 'Drying';
  if (m <= 0.92) return 'Damp';
  return 'Saturated';
}

export function pHWord(pH: number) {
  if (pH < 4.5) return 'Very acid';
  if (pH < 5.5) return 'Acid';
  if (pH < 6.5) return 'Slightly acid';
  if (pH <= 7.3) return 'Neutral';
  return 'Alkaline';
}

/** Soil air, 1 open to 0 sour. */
export function soilAirWord(air: number) {
  if (air > 0.6) return 'Open';
  if (air > 0.3) return 'Close';
  return 'Sour';
}

/** Vapour pressure deficit as keepers talk about it: low is humid and still, high pulls water from leaves. */
export function vpdWord(kPa: number) {
  if (kPa < 0.2) return 'Saturated';
  if (kPa < 0.6) return 'Humid';
  if (kPa < 1.2) return 'Moderate';
  return 'Drying';
}

export function plantStatus(p: { health: number; turgor: number }) {
  if (p.health < 0.4) return { word: 'Declining', tone: 'critical' as const };
  if (p.turgor < 0.4) return { word: 'Wilting', tone: 'warn' as const };
  if (p.health < 0.75) return { word: 'Recovering', tone: 'warn' as const };
  return { word: 'Thriving', tone: 'good' as const };
}

/** The single most important thing to say about a jar. */
export function headline(s: TerrariumState): { text: string; tone: 'good' | 'warn' | 'critical' } {
  const list: Alert[] = alerts(s);
  const top = list.find((a) => a.severity === 'critical') ?? list.find((a) => a.severity === 'warn');
  if (s.plants.length === 0) return { text: 'Nothing is growing.', tone: 'critical' };
  if (!top) return { text: 'In balance.', tone: 'good' };
  return { text: top.message, tone: top.severity === 'critical' ? 'critical' : 'warn' };
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Rough woodlouse" -> "rough woodlice", "Springtail" -> "springtails". */
export function pluralName(common: string) {
  const s = common.toLowerCase();
  if (s.endsWith('woodlouse')) return `${s.slice(0, -5)}lice`;
  return `${s}s`;
}
