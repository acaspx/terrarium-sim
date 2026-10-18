import { describe, expect, it } from 'vitest';
import { dripsPerSecond } from '../src/app/sound.js';

describe('drips', () => {
  it('follow the condensation: none on clear glass, rare on a misted jar, often when it streams', () => {
    expect(dripsPerSecond(0)).toBe(0);
    expect(dripsPerSecond(0.05)).toBe(0);
    // A settled sealed jar (index 0.1 to 0.2): about a drip a minute.
    expect(1 / dripsPerSecond(0.15)).toBeGreaterThan(30);
    expect(1 / dripsPerSecond(0.15)).toBeLessThan(90);
    expect(dripsPerSecond(1.2)).toBeGreaterThan(dripsPerSecond(0.6));
    expect(dripsPerSecond(5)).toBe(0.4);
  });
});
