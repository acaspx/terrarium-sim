import { describe, expect, it } from 'vitest';
import { buildTerrarium, RECIPES, run, type TerrariumSpec } from '../src/engine/index.js';
import { isOffensive, usernameProblem } from '../src/playground/moderation.js';
import { conformState, validateSpec } from '../src/playground/schema.js';
import { handle, memoryStore, newRecoveryCode, normaliseCode } from '../src/playground/server.js';

type Store = ReturnType<typeof memoryStore>;
const spec = (): TerrariumSpec => structuredClone(RECIPES[0]!.spec);
const grown = (s: TerrariumSpec, days: number) => {
  const st = buildTerrarium(s);
  run(st, days * 24);
  return st;
};
const call = (store: Store, method: string, path: string, body?: unknown, headers: Record<string, string> = {}, api = 'terrariums') =>
  handle(new Request(`http://x/api/${api}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers }), store);
const claim = async (store: Store, name: string) => {
  const res = await call(store, 'POST', '', { name }, {}, 'keepers');
  return { res, ...(await res.json()) } as { res: Response; name: string; key: string; error?: string };
};
const as = (k: { name: string; key: string }) => ({ 'x-keeper': k.name, 'x-keeper-key': k.key });
const share = (store: Store, k: { name: string; key: string }, extra: Record<string, unknown> = {}) =>
  call(store, 'POST', '', { spec: spec(), state: grown(spec(), 30), ...extra }, as(k));

describe('keepers', () => {
  it('claims a username once, with a recovery code, and finds it again', async () => {
    const store = memoryStore();
    const k = await claim(store, '  Fern_Keeper ');
    expect(k.res.status).toBe(201);
    expect(k.name).toBe('fern_keeper');
    expect(k.key).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
    expect((await claim(store, 'fern_keeper')).res.status).toBe(409);
    const profile = await (await call(store, 'GET', '?name=fern_keeper', undefined, {}, 'keepers')).json();
    expect(profile).toMatchObject({ name: 'fern_keeper', count: 0 });
    expect('keyHash' in profile).toBe(false);
  });

  it('signs in on another device with the code, however it was typed', async () => {
    const store = memoryStore();
    const k = await claim(store, 'mossy');
    const typed = k.key.toLowerCase().replace(/-/g, ' ');
    expect((await call(store, 'POST', '?action=verify', { name: 'Mossy', key: typed }, {}, 'keepers')).status).toBe(200);
    expect((await call(store, 'POST', '?action=verify', { name: 'mossy', key: newRecoveryCode() }, {}, 'keepers')).status).toBe(401);
    expect(normaliseCode('k7q2m-9xh4t')).toBe('K7Q2M9XH4T');
  });

  it('turns away names that are reserved, malformed or offensive', async () => {
    const store = memoryStore();
    for (const name of ['admin', 'ab', 'has space', 'f u c k', 'sh1tlord', '____']) {
      expect((await claim(store, name)).res.status, name).toBe(400);
    }
    expect(usernameProblem('moss_lover-9')).toBeNull();
  });

  it('limits how many names one person makes in an hour', async () => {
    const store = memoryStore();
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await claim(store, `keeper${i}x`)).res.status);
    expect(codes).toContain(429);
  });
});

describe('community shelf', () => {
  it('shares a jar as it is now, credited to its keeper, on their shelf and the community shelf', async () => {
    const store = memoryStore();
    const k = await claim(store, 'ana');
    const res = await share(store, k, { note: 'Hi' });
    expect(res.status).toBe(201);
    const { item } = await res.json();
    expect(item.day).toBe(30);
    expect(item.keeper).toBe('ana');
    const all = await (await call(store, 'GET', '?sort=recent')).json();
    expect(all.items.map((x: { id: string }) => x.id)).toEqual([item.id]);
    const mine = await (await call(store, 'GET', '?keeper=ana')).json();
    expect(mine.items.map((x: { id: string }) => x.id)).toEqual([item.id]);
    const profile = await (await call(store, 'GET', '?name=ana', undefined, {}, 'keepers')).json();
    expect(profile.count).toBe(1);
  });

  it('needs a keeper, with the right code, to share', async () => {
    const store = memoryStore();
    const k = await claim(store, 'ana');
    expect((await call(store, 'POST', '', { spec: spec(), state: grown(spec(), 1) })).status).toBe(401);
    expect((await share(store, { name: 'ana', key: newRecoveryCode() })).status).toBe(401);
    expect((await share(store, k)).status).toBe(201);
  });

  it('only the keeper who shared a jar can remove it', async () => {
    const store = memoryStore();
    const ana = await claim(store, 'ana');
    const bob = await claim(store, 'bob');
    const { item } = await (await share(store, ana)).json();
    expect((await call(store, 'DELETE', `?id=${item.id}`)).status).toBe(401);
    expect((await call(store, 'DELETE', `?id=${item.id}`, undefined, as(bob))).status).toBe(403);
    expect((await call(store, 'DELETE', `?id=${item.id}`, undefined, as(ana))).status).toBe(200);
    expect((await call(store, 'GET', `?id=${item.id}`)).status).toBe(404);
  });

  it('turns away offensive jar names and notes, but not innocent words that contain them', async () => {
    const store = memoryStore();
    const k = await claim(store, 'ana');
    expect((await share(store, k, { note: 'what a sh1t jar' })).status).toBe(400);
    expect((await call(store, 'POST', '', { spec: { ...spec(), name: 'F U C K' }, state: grown(spec(), 1) }, as(k))).status).toBe(400);
    expect((await call(store, 'POST', '', { spec: { ...spec(), name: 'Spice and grape' }, state: grown(spec(), 1) }, as(k))).status).toBe(201);
    expect(['Shiitake log', 'Torpedo bottle', 'Class of 2026', 'Scunthorpe moss'].some(isOffensive)).toBe(false);
  });

  it('counts one like per visitor, needs no account to like, and hides a jar after several reports', async () => {
    const store = memoryStore();
    const k = await claim(store, 'ana');
    const { item } = await (await share(store, k)).json();
    for (let i = 0; i < 3; i++) await call(store, 'POST', `?id=${item.id}&action=like`, { voter: 'visitor-0001' });
    const { likes } = await (await call(store, 'POST', `?id=${item.id}&action=like`, { voter: 'visitor-0002' })).json();
    expect(likes).toBe(2);
    for (const v of ['reporter-1', 'reporter-2', 'reporter-3']) await call(store, 'POST', `?id=${item.id}&action=report`, { voter: v });
    expect((await (await call(store, 'GET', '')).json()).items).toEqual([]);
    expect((await (await call(store, 'GET', '?keeper=ana')).json()).items).toEqual([]);
  });

  it('limits how often one keeper shares', async () => {
    const store = memoryStore();
    const k = await claim(store, 'ana');
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await call(store, 'POST', '', { spec: spec(), state: grown(spec(), 1) }, as(k))).status);
    expect(codes).toContain(429);
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

  it('keeps where the wood and stone were moved, only for pieces the jar has', () => {
    const s = { ...spec(), hardscape: ['wood'], placed: { wood: { at: [0.3, 9], turn: -Math.PI / 2 }, stone: { at: [0.1, 0.1] } } };
    expect(validateSpec(s).placed).toEqual({ wood: { at: [0.3, 1], turn: 4.712 } });
    expect(validateSpec({ ...s, placed: { wood: { at: ['x', 1] } } }).placed).toBeUndefined();
    expect('placed' in validateSpec({ ...s, placed: undefined })).toBe(false);
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

  it('says so when storage is not configured', async () => {
    expect((await handle(new Request('http://x/api/terrariums'), null)).status).toBe(503);
    expect((await handle(new Request('http://x/api/keepers?name=ana'), null)).status).toBe(503);
  });
});

describe('following', () => {
  const follow = (store: Store, k: { name: string; key: string }, name: string, action = 'follow') =>
    call(store, 'POST', `?action=${action}`, { name }, as(k), 'keepers');
  const ids = async (res: Response) => ((await res.json()).items as { id: string }[]).map((x) => x.id);

  it('follows and unfollows keepers, and counts followers on their profile', async () => {
    const store = memoryStore();
    const ana = await claim(store, 'ana');
    const bob = await claim(store, 'bob');
    expect(await (await follow(store, ana, 'Bob')).json()).toEqual({ following: true, followers: 1 });
    // Following twice counts once.
    expect((await (await follow(store, ana, 'bob')).json()).followers).toBe(1);
    expect((await (await call(store, 'GET', '?name=bob', undefined, {}, 'keepers')).json()).followers).toBe(1);
    expect((await (await call(store, 'GET', '?action=following', undefined, as(ana), 'keepers')).json()).names).toEqual(['bob']);
    expect(await (await follow(store, ana, 'bob', 'unfollow')).json()).toEqual({ following: false, followers: 0 });
    expect((await (await call(store, 'GET', '?action=following', undefined, as(ana), 'keepers')).json()).names).toEqual([]);
    expect((await follow(store, bob, 'bob')).status).toBe(400);
    expect((await follow(store, bob, 'nobody')).status).toBe(404);
  });

  it('needs a keeper, with the right code, to follow or to see who they follow', async () => {
    const store = memoryStore();
    await claim(store, 'ana');
    await claim(store, 'bob');
    expect((await follow(store, { name: 'ana', key: newRecoveryCode() }, 'bob')).status).toBe(401);
    expect((await call(store, 'GET', '?action=following', undefined, {}, 'keepers')).status).toBe(401);
    expect((await call(store, 'GET', '?feed=following')).status).toBe(401);
  });

  it('shows the newest jars from keepers you follow, and nobody else', async () => {
    const store = memoryStore();
    const ana = await claim(store, 'ana');
    const bob = await claim(store, 'bob');
    const cy = await claim(store, 'cy');
    const first = (await (await share(store, bob)).json()).item.id;
    await share(store, cy);
    await new Promise((r) => setTimeout(r, 2));
    const second = (await (await share(store, bob)).json()).item.id;
    expect(await ids(await call(store, 'GET', '?feed=following', undefined, as(ana)))).toEqual([]);
    await follow(store, ana, 'bob');
    const res = await call(store, 'GET', '?feed=following', undefined, as(ana));
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await ids(res)).toEqual([second, first]);
  });
});
