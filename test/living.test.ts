import { describe, expect, it } from 'vitest';
import {
  buildTerrarium, expandFrame, frameDue, MAX_FRAMES, RECIPES, recordFrame, step, toFrame, type Frame, type TerrariumSpec,
} from '../src/engine/index.js';
import { grown, hoursSinceShared, lifeOf, MAX_GROW_DAYS } from '../src/playground/living.js';
import { conformFrames, prepareSubmission } from '../src/playground/schema.js';
import { handle, memoryStore } from '../src/playground/server.js';

const spec = (): TerrariumSpec => structuredClone(RECIPES.find((r) => r.id === 'fern-cabinet')!.spec);
const DAY = 864e5;

/** A jar lived for some days, recording a frame a week as the app does. */
function lived(days: number) {
  const s = buildTerrarium(spec());
  let frames: Frame[] = [];
  for (let h = 0; h < days * 24; h++) {
    step(s);
    if (frameDue(s)) frames = recordFrame(frames, toFrame(s));
  }
  return { state: s, frames };
}

describe('frames', () => {
  it('keep what is visible, and draw back into a jar that matches', () => {
    const { state } = lived(30);
    const back = expandFrame(spec(), toFrame(state));
    expect(back.hour).toBe(state.hour);
    expect(back.plants.map((p) => p.id)).toEqual(state.plants.map((p) => p.id));
    expect(back.plants[0]!.biomassG).toBeCloseTo(state.plants[0]!.biomassG, 1);
    // Frames keep three significant figures.
    expect(Math.abs(back.pools.moldG - state.pools.moldG) / state.pools.moldG).toBeLessThan(0.005);
    expect(back.climate.moisture).toBeGreaterThan(0);
  });

  it('a week apart, small, and thinned evenly once the record is full', () => {
    const { frames } = lived(70);
    expect(frames.map((f) => f.hour % (24 * 7))).toEqual(frames.map(() => 14));
    expect(JSON.stringify(frames[0]).length).toBeLessThan(1500);
    let many: Frame[] = [];
    for (let i = 0; i < 200; i++) many = recordFrame(many, { ...frames[0]!, hour: i * 168 + 14 });
    expect(many.length).toBeLessThanOrEqual(MAX_FRAMES);
    expect(many[0]!.hour).toBe(14);
    expect(many[many.length - 1]!.hour).toBe(199 * 168 + 14);
  });

  it('arriving from a browser are rebuilt, ordered, and stripped of anything strange', () => {
    const { state, frames } = lived(40);
    const evil = [
      ...frames,
      { ...frames[0]!, hour: state.hour + 500 }, // after the share
      { hour: 3, plants: 'lots' }, // malformed
      { ...frames[1]!, injected: '<script>', plants: [...frames[1]!.plants, { id: 'x', speciesId: 'triffid', biomassG: 9, health: 1, turgor: 1 }] },
    ];
    const clean = conformFrames(spec(), evil, state.hour);
    expect(clean.length).toBe(frames.length);
    expect(clean.every((f, i) => i === 0 || f.hour > clean[i - 1]!.hour)).toBe(true);
    expect(clean.every((f) => f.plants.every((p) => p.speciesId !== 'triffid'))).toBe(true);
    expect(JSON.stringify(clean)).not.toContain('injected');
  });
});

describe('shared jars keep living', () => {
  const shared = (days: number, ago: number) => {
    const { state, frames } = lived(days);
    return { ...prepareSubmission({ spec: spec(), state, frames }, 'abcdef', Date.now() - ago * DAY, 'ana') };
  };

  it('grow an hour for every hour since they were shared, the same for everyone', () => {
    const sub = shared(20, 10);
    const now = Date.now();
    const a = grown(sub, now);
    const b = grown(structuredClone(sub), now);
    expect(Math.floor(a.hour / 24)).toBe(30);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('stop ageing after two years', () => {
    expect(hoursSinceShared({ createdAt: Date.now() - 5 * 365 * DAY }, Date.now())).toBe(MAX_GROW_DAYS * 24);
    expect(hoursSinceShared({ createdAt: Date.now() + DAY }, Date.now())).toBe(0);
  });

  it('play their life as a time-lapse: recorded past, the day shared, then a week at a time on their own', () => {
    const sub = shared(35, 21);
    const life = lifeOf(sub, Date.now());
    const kinds = life.map((m) => m.kind);
    expect(kinds.filter((k) => k === 'recorded').length).toBe(sub.frames!.length);
    expect(kinds.filter((k) => k === 'shared').length).toBe(1);
    expect(kinds.filter((k) => k === 'grown').length).toBeGreaterThanOrEqual(3);
    expect(life.every((m, i) => i === 0 || m.day >= life[i - 1]!.day)).toBe(true);
    expect(life[life.length - 1]!.day).toBe(56);
  });

  it('keep long lives to a watchable length', () => {
    const sub = shared(10, 700);
    const life = lifeOf(sub, Date.now());
    expect(life.length).toBeLessThanOrEqual(60);
    expect(life.some((m) => m.kind === 'shared')).toBe(true);
    expect(life[life.length - 1]!.day).toBe(710);
  });

  it('lists leave the frames out; opening one jar brings them', async () => {
    const store = memoryStore();
    const claim = await (await handle(new Request('http://x/api/keepers', { method: 'POST', body: JSON.stringify({ name: 'ana' }) }), store)).json();
    const { state, frames } = lived(30);
    const headers = { 'x-keeper': 'ana', 'x-keeper-key': claim.key };
    const res = await handle(new Request('http://x/api/terrariums', { method: 'POST', headers, body: JSON.stringify({ spec: spec(), state, frames }) }), store);
    const { item } = await res.json();
    expect(item.frames.length).toBe(frames.length);
    const list = await (await handle(new Request('http://x/api/terrariums'), store)).json();
    expect(list.items[0].frames).toBeUndefined();
    expect(list.items[0].frameCount).toBe(frames.length);
    const one = await (await handle(new Request(`http://x/api/terrariums?id=${item.id}`), store)).json();
    expect(one.frames.length).toBe(frames.length);
  });

  it('jars shared before time-lapses still grow and play from the day they were shared', () => {
    const { state } = lived(15);
    const old = { ...prepareSubmission({ spec: spec(), state }, 'abcdef', Date.now() - 14 * DAY, 'ana') };
    delete old.frames;
    const life = lifeOf(old, Date.now());
    expect(life[0]!.kind).toBe('shared');
    expect(life[life.length - 1]!.day).toBe(29);
  });
});
