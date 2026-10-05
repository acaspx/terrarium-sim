import { describe, expect, it } from 'vitest';
import { care, createTerrarium, PRESETS, run, totalWaterG, type Setup } from '../src/engine/index.js';
import { thermalPerformance } from '../src/engine/core/math.js';

const days = (n: number) => n * 24;
const preset = (name: string): Setup => structuredClone(PRESETS[name]!);

describe('water cycle', () => {
  it('conserves water in a sealed jar', () => {
    const s = createTerrarium(preset('tropical-jar'));
    const before = totalWaterG(s);
    run(s, days(90));
    expect(totalWaterG(s)).toBeCloseTo(before, 6);
  });

  it('accounts for every gram when vented and misted', () => {
    const s = createTerrarium(preset('tropical-jar'));
    const before = totalWaterG(s);
    care.setVentilation(s, 0.5);
    run(s, days(10));
    care.mist(s, 40);
    run(s, days(10));
    expect(totalWaterG(s) + s.waterLostG - s.waterAddedG).toBeCloseTo(before, 6);
  });

  it('dries out with the lid left off', () => {
    const s = createTerrarium(preset('tropical-jar'));
    care.setVentilation(s, 1);
    run(s, days(30));
    expect(s.climate.moisture).toBeLessThan(0.4);
  });

  it('shows condensation on the glass in a sealed jar', () => {
    const s = createTerrarium(preset('tropical-jar'));
    let peak = 0;
    run(s, days(3), undefined);
    for (let i = 0; i < 24; i++) { run(s, 1); peak = Math.max(peak, s.climate.condensationIndex); }
    expect(peak).toBeGreaterThan(0.05);
  });
});

describe('clean-up crew', () => {
  it('a new jar gets a mold bloom, and springtails clear it', () => {
    const withCrew = createTerrarium(preset('tropical-jar'));
    const without = createTerrarium(preset('no-crew'));
    run(withCrew, days(25));
    run(without, days(25));
    expect(without.pools.moldG).toBeGreaterThan(0.2); // "new terrarium syndrome"
    run(withCrew, days(65));
    run(without, days(65));
    expect(withCrew.pools.moldG).toBeLessThan(0.1 * without.pools.moldG);
  });

  it('springtail population grows on mold, then falls back as food runs out', () => {
    const s = createTerrarium(preset('tropical-jar'));
    const pop = () => { const f = s.fauna.find((x) => x.speciesId === 'springtail')!; return f.juveniles + f.adults; };
    run(s, days(50));
    const peak = pop();
    run(s, days(130));
    expect(peak).toBeGreaterThan(1000);
    expect(pop()).toBeLessThan(peak);
    expect(pop()).toBeGreaterThan(50); // settles, does not go extinct
  });

  it('springtails die in a dried-out jar', () => {
    const s = createTerrarium({ ...preset('tropical-jar'), initialMoisture: 0.2 });
    run(s, days(30));
    expect(s.fauna.find((f) => f.speciesId === 'springtail')).toBeUndefined();
  });
});

describe('plants', () => {
  it('fittonia faints when dry and recovers after misting', () => {
    const s = createTerrarium({ ...preset('tropical-jar'), initialMoisture: 0.3 });
    const fittonia = s.plants.find((p) => p.speciesId === 'fittonia')!;
    run(s, days(2));
    expect(fittonia.turgor).toBeLessThan(0.3);
    care.mist(s, 300);
    run(s, days(1));
    expect(fittonia.turgor).toBeGreaterThan(0.8);
    expect(fittonia.health).toBeGreaterThan(0.5);
  });

  it('direct sun through closed glass cooks the jar', () => {
    const s = createTerrarium(preset('overwatered-windowsill'));
    run(s, days(60));
    expect(s.plants.length).toBe(0);
    expect(s.events.some((e) => e.type === 'plant-death')).toBe(true);
  });

  it('plants starve in a dark corner', () => {
    const s = createTerrarium(preset('tropical-jar'));
    care.setLight(s, 5);
    run(s, days(120));
    expect(s.plants.length).toBeLessThan(5);
  });

  it('a balanced jar keeps every plant alive for a year', () => {
    const s = createTerrarium(preset('tropical-jar'));
    run(s, days(365));
    expect(s.plants.length).toBe(5);
    expect(s.plants.every((p) => p.health > 0.8)).toBe(true);
  });
});

describe('engine', () => {
  it('is deterministic', () => {
    const a = createTerrarium(preset('overwatered-windowsill'));
    const b = createTerrarium(preset('overwatered-windowsill'));
    run(a, days(60));
    run(b, days(60));
    expect(a.pools).toEqual(b.pools);
    expect(a.fauna).toEqual(b.fauna);
  });

  it('thermal performance curve peaks at the optimum and is zero at the limits', () => {
    const r = { min: 5, opt: 21, max: 30 };
    expect(thermalPerformance(21, r)).toBeCloseTo(1);
    expect(thermalPerformance(5, r)).toBe(0);
    expect(thermalPerformance(30, r)).toBe(0);
    expect(thermalPerformance(27, r)).toBeLessThan(thermalPerformance(21, r));
  });
});
