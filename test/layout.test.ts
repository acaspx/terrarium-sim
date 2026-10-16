import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RECIPES, VESSELS, type TerrariumSpec } from '../src/engine/index.js';
import { dishSpot, layoutFor, obstaclesFor, stoneSize, stoneSpot, woodPath } from '../src/app/three/layout.js';
import { insideFp } from '../src/app/three/vessel.js';

const crabs = { speciesId: 'vampire-crab', count: 3 };
// Every recipe in every vessel, with wood, stone and crabs: the most crowded floors there are.
const designs: TerrariumSpec[] = RECIPES.flatMap((r) => VESSELS.map((v) => ({
  ...structuredClone(r.spec), vessel: v.id, sizeL: v.sizes[0]!, hardscape: ['wood', 'stone', 'leaf-litter'], fauna: [...r.spec.fauna, crabs],
} as TerrariumSpec)));

describe('where the stone goes', () => {
  it('never lands on the log or in the water dish, and stays off the glass', () => {
    for (const spec of designs) {
      const L = layoutFor(spec);
      const [x, z] = stoneSpot(L, spec);
      const r = stoneSize(L) * 1.45;
      const label = `${spec.name} in a ${spec.sizeL} L ${spec.vessel}`;
      const d = dishSpot(L);
      expect(Math.hypot(x - d.at[0], z - d.at[1]), label).toBeGreaterThan(d.r + r * 0.8);
      for (const p of new THREE.CatmullRomCurve3(woodPath(L).trunk).getPoints(12)) {
        // Only where the log lies on the soil; its raised end passes over.
        if (p.y < L.gy + 0.1) expect(Math.hypot(x - p.x, z - p.z), label).toBeGreaterThan(r * 0.8);
      }
      expect(insideFp(L.groundFp, x, z, r * 0.8), label).toBe(true);
    }
  });

  it('stays where the keeper moved it', () => {
    const spec = { ...designs[0]!, placed: { stone: { at: [-0.3, 0.2] as [number, number] } } };
    const L = layoutFor(spec);
    const [x] = stoneSpot(L, spec);
    expect(x).toBeLessThan(0);
  });

  it('is an obstacle for the animals, as is the dish when there are crabs', () => {
    const L = layoutFor(designs[0]!);
    expect(obstaclesFor(L, designs[0]!)).toHaveLength(2);
    expect(obstaclesFor(L, { ...designs[0]!, fauna: [], hardscape: [] })).toHaveLength(0);
  });
});
