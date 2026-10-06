import { describe, expect, it } from 'vitest';
import { buildTerrarium, RECIPES, run, type TerrariumSpec } from '../src/engine/index.js';
import { conformState, validateSpec } from '../src/playground/schema.js';
import { handle, memoryStore } from '../src/playground/server.js';

const spec = (): TerrariumSpec => structuredClone(RECIPES[0]!.spec);
const grown = (s: TerrariumSpec, days: number) => {
  const st = buildTerrarium(s);
  run(st, days * 24);
  return st;
};
const call = (store: ReturnType<typeof memoryStore>, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  handle(new Request(`http://x/api/terrariums${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers }), store);

describe('playground', () => {
  it('shares a jar as it is now, and lists it', async () => {
    const store = memoryStore();
    const res = await call(store, 'POST', '', { spec: spec(), state: grown(spec(), 30), author: 'Ana', note: 'Hi' });
    expect(res.status).toBe(201);
    const { item, deleteToken } = await res.json();
    expect(item.day).toBe(30);
    expect(item.author).toBe('Ana');
    expect(typeof deleteToken).toBe('string');
    const list = await (await call(store, 'GET', '?sort=recent')).json();
    expect(list.items.map((x: { id: string }) => x.id)).toEqual([item.id]);
  });

  it('accepts only options the builder offers', () => {
    expect(() => validateSpec({ ...spec(), vessel: 'aquarium' })).toThrow(/vessel/);
    expect(() => validateSpec({ ...spec(), sizeL: 7 })).toThrow(/size/);
    expect(() => validateSpec({ ...spec(), lid: 'trapdoor' })).toThrow(/lid/);
    for (const r of RECIPES) expect(validateSpec(r.spec)).toEqual(r.spec);
    expect(() => validateSpec({ ...spec(), plants: [] })).toThrow(/plants/);
    expect(() => validateSpec({ ...spec(), plants: [{ speciesId: 'triffid', size: 'small' }] })).toThrow(/plant/);
    expect(validateSpec({ ...spec(), name: '  Fern‮  gully\u0000 ' }).name).toBe('Fern gully');
  });

  it('keeps only the state the engine would produce', () => {
    const s = grown(spec(), 10) as unknown as Record<string, unknown>;
    const evil = {
      ...s, hour: 1e12, injected: '<script>',
      pools: { ...(s.pools as object), moldG: 'lots' },
      plants: [...(s.plants as object[]), { id: 'x', speciesId: 'triffid', biomassG: 5, health: 1, turgor: 1, lightEma: 1 }],
    };
    const st = conformState(spec(), evil);
    expect('injected' in st).toBe(false);
    expect(st.hour).toBeLessThanOrEqual(5 * 365 * 24);
    expect(typeof st.pools.moldG).toBe('number');
    expect(st.plants.every((p) => p.speciesId !== 'triffid')).toBe(true);
  });

  it('counts one like per visitor and only lets the sharer remove it', async () => {
    const store = memoryStore();
    const { item, deleteToken } = await (await call(store, 'POST', '', { spec: spec(), state: grown(spec(), 5) })).json();
    for (let i = 0; i < 3; i++) await call(store, 'POST', `?id=${item.id}&action=like`, { voter: 'visitor-0001' });
    const { likes } = await (await call(store, 'POST', `?id=${item.id}&action=like`, { voter: 'visitor-0002' })).json();
    expect(likes).toBe(2);
    expect((await call(store, 'DELETE', `?id=${item.id}`, undefined, { 'x-delete-token': 'guess' })).status).toBe(403);
    expect((await call(store, 'DELETE', `?id=${item.id}`, undefined, { 'x-delete-token': deleteToken })).status).toBe(200);
    expect((await call(store, 'GET', `?id=${item.id}`)).status).toBe(404);
  });

  it('hides a jar after several reports, and limits how often one person shares', async () => {
    const store = memoryStore();
    const { item } = await (await call(store, 'POST', '', { spec: spec(), state: grown(spec(), 1) })).json();
    for (const v of ['reporter-1', 'reporter-2', 'reporter-3']) await call(store, 'POST', `?id=${item.id}&action=report`, { voter: v });
    expect((await (await call(store, 'GET', '')).json()).items).toEqual([]);
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await call(store, 'POST', '', { spec: spec(), state: grown(spec(), 1) })).status);
    expect(codes).toContain(429);
  });

  it('says so when storage is not configured', async () => {
    expect((await handle(new Request('http://x/api/terrariums'), null)).status).toBe(503);
  });
});
