import { describe, expect, it } from 'vitest';
import { BLANK_SPEC, checkSpec, forecast, RECIPES, specToSetup, type TerrariumSpec } from '../src/engine/index.js';

const recipe = (id: string): TerrariumSpec => structuredClone(RECIPES.find((r) => r.id === id)!.spec);

describe('customization', () => {
  it('every option changes the physical setup', () => {
    const base = specToSetup(recipe('tropical-jar'));
    const vented = specToSetup({ ...recipe('tropical-jar'), lid: 'cracked' });
    const soil = specToSetup({ ...recipe('tropical-jar'), substrate: 'potting-soil' });
    const sunny = specToSetup({ ...recipe('tropical-jar'), placement: 'south-window' });
    const bare = specToSetup({ ...recipe('tropical-jar'), drainage: 'none' });
    expect(vented.container.ventilation).toBeGreaterThan(base.container.ventilation);
    expect(soil.container.substrate!.drainPerH).toBeLessThan(base.container.substrate!.drainPerH);
    expect(sunny.container.light.ppfd).toBeGreaterThan(base.container.light.ppfd);
    expect(bare.container.drainageL).toBe(0);
  });

  it('a narrow-necked bottle vents less than a wide jar with the same lid', () => {
    const jar = specToSetup({ ...BLANK_SPEC, vessel: 'jar', lid: 'open' });
    const bottle = specToSetup({ ...BLANK_SPEC, vessel: 'bottle', lid: 'open' });
    expect(bottle.container.ventilation).toBeLessThan(jar.container.ventilation);
  });

  it('flags the classic beginner mistakes before you build', () => {
    const codes = checkSpec({
      ...BLANK_SPEC, placement: 'south-window', drainage: 'none', startMoisture: 'wet',
      plants: [{ speciesId: 'maidenhair-fern', size: 'small' }],
    });
    const text = codes.map((c) => c.message).join(' ');
    expect(codes.some((c) => c.severity === 'critical' && c.target === 'placement')).toBe(true);
    expect(text).toMatch(/drainage/);
    expect(text).toMatch(/beginner mistake/);
  });

  it('the recipes are sound: no warnings and a healthy forecast', () => {
    for (const r of RECIPES) {
      expect(checkSpec(r.spec).filter((i) => i.severity !== 'info')).toEqual([]);
      const f = forecast(r.spec, 90);
      expect(f.plantsAlive).toBe(f.plantsStart);
      expect(f.finalScore).toBeGreaterThan(80);
    }
  });

  it('forecasts a bad design as worse than a good one', () => {
    const good = forecast(recipe('tropical-jar'), 90);
    const bad = forecast({ ...recipe('tropical-jar'), placement: 'south-window', startMoisture: 'wet', drainage: 'none' }, 90);
    expect(bad.finalScore).toBeLessThan(good.finalScore - 20);
    expect(bad.plantsAlive).toBeLessThan(good.plantsAlive);
  });

  it('counts dead plants against health', () => {
    const sunny = forecast({ ...recipe('tropical-jar'), placement: 'south-window' }, 90);
    expect(sunny.plantsAlive).toBeLessThan(sunny.plantsStart);
    expect(sunny.finalScore).toBeLessThan(60);
  });
});
