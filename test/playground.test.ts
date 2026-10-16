import { describe, expect, it } from 'vitest';
import { buildTerrarium, RECIPES, run, type TerrariumSpec } from '../src/engine/index.js';
import { isOffensive, usernameProblem } from '../src/playground/moderation.js';
import { conformState, validateSpec } from '../src/playground/schema.js';
import { handle, memoryStore, newRecoveryCode, normaliseCode, redisStore, storageConfig, type PlaygroundStore } from '../src/playground/server.js';

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
    const listed = await call(store, 'GET', '?sort=recent');
    expect(listed.headers.get('cache-control')).toBe('no-store');
    const all = await listed.json();
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

describe('storage settings', () => {
  it('finds the database under any of the names deployments use', () => {
    expect(storageConfig({ REDIS_URL: 'redis://default:pw@redis-1.cloud.redislabs.com:1234' })).toEqual({ url: 'redis://default:pw@redis-1.cloud.redislabs.com:1234', from: 'REDIS_URL' });
    expect(storageConfig({ STORAGE_KV_URL: 'rediss://default:pw@a.upstash.io:6379' })).toMatchObject({ from: 'STORAGE_KV_URL' });
    // Upstash's REST address and token name the same database; the token is its password.
    expect(storageConfig({ KV_REST_API_URL: 'https://a-1.upstash.io', KV_REST_API_TOKEN: 't/k=' })).toEqual({ url: 'rediss://default:t%2Fk%3D@a-1.upstash.io:6379', from: 'KV_REST_API_URL' });
    expect(storageConfig({ STORAGE_UPSTASH_REDIS_REST_URL: 'https://b.upstash.io', STORAGE_UPSTASH_REDIS_REST_TOKEN: 'u' })).toMatchObject({ url: 'rediss://default:u@b.upstash.io:6379' });
  });

  it('says what it found, by name only, when it cannot connect', () => {
    const none = storageConfig({ PATH: '/bin' });
    expect('problem' in none && none.problem).toMatch(/no storage settings/);
    const half = storageConfig({ KV_REST_API_URL: 'https://a.upstash.io', REDIS_URL: 'not a url secret' });
    expect('problem' in half && half.problem).toMatch(/Found KV_REST_API_URL, REDIS_URL, but no redis:\/\/ address/);
    expect(JSON.stringify(half)).not.toContain('secret');
  });

  it('explains the missing store in the error', async () => {
    const res = await handle(new Request('http://x/api/terrariums'), null, { why: 'Connect it.' });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ setup: 'Connect it.' });
  });
});

describe('moderation', () => {
  const mod = (store: Store, method: string, path: string, body: unknown, k: { name: string; key: string }, api = 'terrariums') =>
    handle(new Request(`http://x/api/${api}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: as(k) }), store, { moderators: ['Mia'] });

  it('lets a moderator remove any jar, and nobody else', async () => {
    const store = memoryStore();
    const ana = await claim(store, 'ana');
    const bob = await claim(store, 'bob');
    const mia = await claim(store, 'mia');
    const { item } = await (await share(store, ana)).json();
    expect((await mod(store, 'DELETE', `?id=${item.id}`, undefined, bob)).status).toBe(403);
    expect((await mod(store, 'DELETE', `?id=${item.id}`, undefined, mia)).status).toBe(200);
    expect((await call(store, 'GET', `?id=${item.id}`)).status).toBe(404);
  });

  it('bans a keeper: their jars go, their name stays taken and cannot sign in', async () => {
    const store = memoryStore();
    const ana = await claim(store, 'ana');
    const mia = await claim(store, 'mia');
    await share(store, ana);
    expect((await mod(store, 'POST', '?action=ban', { name: 'ana' }, ana, 'keepers')).status).toBe(403);
    expect((await mod(store, 'POST', '?action=ban', { name: 'mia' }, mia, 'keepers')).status).toBe(400);
    expect((await mod(store, 'POST', '?action=ban', { name: 'ana' }, mia, 'keepers')).status).toBe(200);
    expect((await (await call(store, 'GET', '?sort=recent')).json()).items).toEqual([]);
    expect((await share(store, ana)).status).toBe(401);
    expect((await call(store, 'GET', '?name=ana', undefined, {}, 'keepers')).status).toBe(404);
    expect((await claim(store, 'ana')).res.status).toBe(409);
  });

  it('tells a moderator they are one', async () => {
    const store = memoryStore();
    const mia = await claim(store, 'mia');
    const ana = await claim(store, 'ana');
    expect((await (await mod(store, 'GET', '?action=following', undefined, mia, 'keepers')).json()).moderator).toBe(true);
    expect((await (await mod(store, 'GET', '?action=following', undefined, ana, 'keepers')).json()).moderator).toBe(false);
  });
});

describe('link previews', () => {
  const jpeg = 'data:image/jpeg;base64,' + btoa('\xff\xd8\xff fake jpeg');

  it('stores a preview card from the jar\'s keeper only, and serves it as an image', async () => {
    const store = memoryStore();
    const ana = await claim(store, 'ana');
    const bob = await claim(store, 'bob');
    const { item } = await (await share(store, ana)).json();
    expect((await call(store, 'POST', `?id=${item.id}&action=card`, { image: jpeg }, as(bob))).status).toBe(403);
    expect((await call(store, 'POST', `?id=${item.id}&action=card`, { image: 'data:image/png;base64,AAAA' }, as(ana))).status).toBe(400);
    expect((await call(store, 'POST', `?id=${item.id}&action=card`, { image: jpeg }, as(ana))).status).toBe(200);
    const img = await call(store, 'GET', `?id=${item.id}&card=1`);
    expect(img.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await img.arrayBuffer()).slice(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });

  it('serves a page with preview tags that sends people on to the jar', async () => {
    const store = memoryStore();
    const ana = await claim(store, 'ana');
    const { item } = await (await share(store, ana, { note: 'Ferns & <moss>' })).json();
    await call(store, 'POST', `?id=${item.id}&action=card`, { image: jpeg }, as(ana));
    const res = await handle(new Request(`http://x/api/share?id=${item.id}`, { headers: { 'x-forwarded-host': 'terrarium.example', 'x-forwarded-proto': 'https' } }), store);
    const html = await res.text();
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain(`<meta property="og:title" content="${item.spec.name} by @ana">`);
    expect(html).toContain('content="Ferns &#38; &#60;moss&#62;"');
    expect(html).toContain(`content="https://terrarium.example/api/terrariums?id=${item.id}&#38;card=1"`);
    expect(html).toContain(`/#/community/${item.id}`);
    // As Vercel delivers it after the rewrite: the original path.
    expect(await (await handle(new Request(`http://x/s/${item.id}`), store)).text()).toContain(`by @ana`);
    // Without storage it still opens the app.
    expect(await (await handle(new Request('http://x/api/share?id=nope'), null)).text()).toContain('/#/community');
  });
});

/**
 * The same behaviour from both stores. Real Redis runs when REDIS_TEST_URL is set, e.g.
 * REDIS_TEST_URL=redis://localhost:6390 npx vitest run (the database there is emptied).
 */
const stores: [string, () => Promise<PlaygroundStore>][] = [['memory', async () => memoryStore()]];
const redisUrl = process.env.REDIS_TEST_URL;
if (redisUrl) {
  stores.push(['redis', async () => {
    const { createClient } = await import('redis');
    const c = createClient({ url: redisUrl });
    await c.connect();
    await c.flushDb();
    await c.quit();
    return redisStore(redisUrl);
  }]);
}

describe.each(stores)('%s store', (_, make) => {
  const sub = (id: string, keeper: string, createdAt: number) =>
    ({ ...JSON.parse(JSON.stringify({ id, keeper, createdAt, likes: 0, day: 1, note: '', spec: spec(), state: { hour: 0 } })) });

  it('keeps jars newest first, by keeper, liked once per voter, and removes them', async () => {
    const s = await make();
    await s.put(sub('aaaaaa', 'ana', 1));
    await s.put(sub('bbbbbb', 'bob', 2));
    await s.put(sub('cccccc', 'ana', 3));
    expect((await s.list('recent', 0, 10)).map((x) => x.id)).toEqual(['cccccc', 'bbbbbb', 'aaaaaa']);
    expect((await s.list('recent', 1, 1)).map((x) => x.id)).toEqual(['bbbbbb']);
    expect((await s.listByKeeper('ana', 0, 10)).map((x) => x.id)).toEqual(['cccccc', 'aaaaaa']);
    expect(await s.countByKeeper('ana')).toBe(2);
    expect(await s.like('aaaaaa', 'v1')).toBe(1);
    expect(await s.like('aaaaaa', 'v1')).toBe(1);
    expect(await s.like('aaaaaa', 'v2')).toBe(2);
    expect(await s.like('nothere', 'v1')).toBeNull();
    expect((await s.list('liked', 0, 1))[0]).toMatchObject({ id: 'aaaaaa', likes: 2 });
    expect((await s.get('aaaaaa'))?.likes).toBe(2);
    expect(await s.remove('aaaaaa', 'bob')).toBe(false);
    expect(await s.remove('aaaaaa', 'ana')).toBe(true);
    expect(await s.get('aaaaaa')).toBeNull();
    expect(await s.countByKeeper('ana')).toBe(1);
  });

  it('hides a jar after enough reports', async () => {
    const s = await make();
    await s.put(sub('aaaaaa', 'ana', 1));
    expect(await s.report('aaaaaa', 'v1')).toBe(false);
    expect(await s.report('aaaaaa', 'v2')).toBe(false);
    expect(await s.report('aaaaaa', 'v3')).toBe(true);
    expect(await s.list('recent', 0, 10)).toEqual([]);
  });

  it('keeps keepers, names once, bans, cards, follows and the feed', async () => {
    const s = await make();
    expect(await s.createKeeper({ name: 'ana', createdAt: 1, keyHash: 'h' })).toBe(true);
    expect(await s.createKeeper({ name: 'ana', createdAt: 2, keyHash: 'x' })).toBe(false);
    expect(await s.getKeeper('ana')).toEqual({ name: 'ana', createdAt: 1, keyHash: 'h' });
    await s.createKeeper({ name: 'bob', createdAt: 1, keyHash: 'h' });
    await s.put(sub('aaaaaa', 'bob', 1));
    await s.put(sub('bbbbbb', 'cy', 2));
    await s.put(sub('cccccc', 'bob', 3));
    await s.follow('ana', 'bob');
    await s.follow('ana', 'cy');
    expect(await s.following('ana')).toEqual(['bob', 'cy']);
    expect(await s.followerCount('bob')).toBe(1);
    expect((await s.feed(['bob', 'cy'], 0, 2)).map((x) => x.id)).toEqual(['cccccc', 'bbbbbb']);
    expect((await s.feed(['bob', 'cy'], 2, 2)).map((x) => x.id)).toEqual(['aaaaaa']);
    await s.unfollow('ana', 'cy');
    expect(await s.following('ana')).toEqual(['bob']);
    await s.setCard('aaaaaa', 'QUJD');
    expect(await s.getCard('aaaaaa')).toBe('QUJD');
    await s.ban('bob');
    expect((await s.getKeeper('bob'))?.banned).toBe(true);
    expect(await s.listByKeeper('bob', 0, 10)).toEqual([]);
    expect(await s.getCard('aaaaaa')).toBeNull();
    expect(await s.allow('k', 2, 60)).toBe(true);
    expect(await s.allow('k', 2, 60)).toBe(true);
    expect(await s.allow('k', 2, 60)).toBe(false);
  });
});
