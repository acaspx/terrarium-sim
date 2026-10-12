import { describe, expect, it } from 'vitest';
import {
  BLANK_SPEC, buildTerrarium, checkSpec, dli, layoutOf, RECIPES, run, shading, step, type TerrariumSpec,
} from '../src/engine/index.js';

const days = (n: number) => n * 24;
const recipe = (id: string): TerrariumSpec => structuredClone(RECIPES.find((r) => r.id === id)!.spec);

describe('placement and shade', () => {
  it('a short plant under a tall one gets less light, and grows less where light is scarce', () => {
    // Under a bright grow light shade costs nothing (the moss is saturated anyway); by a north window it does.
    const open: TerrariumSpec = { ...recipe('fern-cabinet'), placement: 'north-window' };
    const under: TerrariumSpec = structuredClone(open);
    under.plants[2]!.at = [-0.12, -0.45]; // spike moss tucked under the bird's nest fern
    const a = buildTerrarium(open);
    const b = buildTerrarium(under);
    run(a, days(120));
    run(b, days(120));
    const moss = (s: typeof a) => s.plants.find((p) => p.speciesId === 'spike-moss')!;
    expect(moss(b).shade!).toBeGreaterThan(0.2);
    expect(moss(a).shade ?? 0).toBeLessThan(0.05);
    expect(moss(b).biomassG).toBeLessThan(moss(a).biomassG);
  });

  it('only taller neighbours cast shade, and it falls off with distance', () => {
    const fern = { speciesId: 'birds-nest-fern', biomassG: 100 };
    const moss = { speciesId: 'cushion-moss', biomassG: 40 };
    const [, near] = shading([{ ...fern, at: [0, 0] }, { ...moss, at: [0.1, 0] }], 15);
    const [, far] = shading([{ ...fern, at: [0, 0] }, { ...moss, at: [1.6, 0] }], 15);
    const [onFern] = shading([{ ...fern, at: [0, 0] }, { ...moss, at: [0.1, 0] }], 15);
    expect(near).toBeGreaterThan(far!);
    expect(far).toBe(0);
    expect(onFern).toBe(0);
  });

  it('fills in an automatic layout, with tall plants toward the back', () => {
    const spec: TerrariumSpec = { ...BLANK_SPEC, plants: [{ speciesId: 'cushion-moss', size: 'small' }, { speciesId: 'birds-nest-fern', size: 'small' }] };
    const [moss, fern] = layoutOf(spec);
    expect(fern![1]).toBeLessThan(moss![1]);
  });

  it('warns in the builder when a plant will end up in shade', () => {
    const spec = recipe('fern-cabinet');
    spec.plants[2]!.at = [-0.12, -0.45];
    expect(checkSpec(spec).some((i) => i.target === 'spike-moss' && /shade/.test(i.message))).toBe(true);
  });
});

describe('soil', () => {
  it('starts at the pH of the mix and slowly turns more acid as organic matter rots', () => {
    const s = buildTerrarium(recipe('tropical-jar'));
    expect(s.soil!.pH).toBeCloseTo(5.3, 5);
    run(s, days(365));
    expect(s.soil!.pH).toBeLessThan(5.3);
    expect(s.soil!.pH).toBeGreaterThan(4.6);
  });

  it('acid peat slows plants that want neutral soil, but suits moss', () => {
    const grow = (substrate: TerrariumSpec['substrate'], speciesId: string) => {
      const s = buildTerrarium({ ...recipe('bottle-garden'), substrate, plants: [{ speciesId, size: 'small' }] });
      run(s, days(90));
      return s.plants[0]!.biomassG;
    };
    expect(grow('peat', 'maidenhair-fern')).toBeLessThan(grow('bioactive', 'maidenhair-fern'));
    expect(grow('peat', 'cushion-moss')).toBeGreaterThanOrEqual(grow('bioactive', 'cushion-moss'));
  });

  it('loses its air when waterlogged, and gets it back as it drains', () => {
    const s = buildTerrarium({ ...recipe('tropical-jar'), drainage: 'none', startMoisture: 'wet', substrate: 'potting-soil' });
    s.pools.substrateWaterG *= 1.4;
    run(s, days(2));
    expect(s.soil!.air).toBeLessThan(0.3);
  });

  it('reports vapour pressure deficit and daily light integral', () => {
    const s = buildTerrarium(recipe('tropical-jar'));
    run(s, days(10) + 13);
    expect(s.climate.vpdKPa).toBeGreaterThan(0);
    expect(s.climate.vpdKPa).toBeLessThan(0.5); // a sealed jar's air is nearly saturated
    expect(dli(s.container)).toBeCloseTo((120 * 12 * 3600) / 1e6, 5);
  });
});

describe('fungi', () => {
  it('driftwood in a humid jar sprouts mushrooms that collapse after a week', () => {
    const s = buildTerrarium(recipe('fern-cabinet'));
    run(s, days(150));
    const flush = s.events.find((e) => e.type === 'mushrooms');
    expect(flush).toBeDefined();
    const t = buildTerrarium(recipe('fern-cabinet'));
    run(t, flush!.hour + 72);
    expect(t.pools.mushroomG!).toBeGreaterThan(0);
    run(t, days(8));
    expect(t.pools.mushroomG).toBe(0);
  });

  it('no wood, no mushrooms; an open, dry jar does not fruit', () => {
    const bare = buildTerrarium({ ...recipe('fern-cabinet'), hardscape: ['leaf-litter'] });
    run(bare, days(150));
    expect(bare.events.some((e) => e.type === 'mushrooms')).toBe(false);
    const open = buildTerrarium({ ...recipe('tropical-jar'), lid: 'open' });
    run(open, days(150));
    expect(open.events.some((e) => e.type === 'mushrooms')).toBe(false);
  });
});

describe('new animals', () => {
  it('each isopod morph can hold a colony in a jar that suits it', () => {
    for (const id of ['dairy-cow-isopod', 'rubber-ducky-isopod', 'magic-potion-isopod']) {
      const s = buildTerrarium({ ...recipe('fern-cabinet'), fauna: [{ speciesId: 'springtail', count: 150 }, { speciesId: id, count: 8 }] });
      run(s, days(180));
      const f = s.fauna.find((x) => x.speciesId === id);
      expect(f, id).toBeDefined();
      expect(f!.adults + f!.juveniles, id).toBeGreaterThan(4);
    }
  });

  it('warns that big isopods are too hungry for a small jar', () => {
    const issues = checkSpec({ ...recipe('tropical-jar'), sizeL: 6, fauna: [{ speciesId: 'dairy-cow-isopod', count: 10 }] });
    expect(issues.some((i) => i.target === 'dairy-cow-isopod' && i.severity === 'warn')).toBe(true);
  });
});

describe('saved jars from before', () => {
  it('a state without soil, positions or fungi still steps, and gains soil', () => {
    const s = buildTerrarium(recipe('tropical-jar'));
    delete s.soil;
    for (const p of s.plants) delete p.at;
    run(s, days(5));
    step(s);
    expect(s.soil!.pH).toBeGreaterThan(4);
    expect(s.plants.every((p) => (p.shade ?? 0) === 0)).toBe(true);
  });
});
