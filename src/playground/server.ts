/**
 * The community shelf API: keepers claim a username, then share terrariums
 * they are proud of to a public shelf that anyone can browse.
 *
 *   GET    /api/keepers?name=NAME                        a keeper's profile
 *   POST   /api/keepers                                  claim { name } -> { name, key }
 *   POST   /api/keepers?action=verify                    sign in on another device { name, key }
 *
 *   GET    /api/terrariums?sort=recent|liked&cursor=N    a page of the community shelf
 *   GET    /api/terrariums?keeper=NAME&cursor=N          one keeper's shelf
 *   GET    /api/terrariums?id=ID                         one terrarium
 *   POST   /api/terrariums                               share { spec, state, note? }      (keeper only)
 *   POST   /api/terrariums?id=ID&action=like|report      { voter }                         (anyone)
 *   DELETE /api/terrariums?id=ID                                                           (its keeper only)
 *
 * Keepers prove who they are with headers x-keeper (the username) and
 * x-keeper-key (the recovery code). There are no passwords or emails: the code
 * is the account, so it is shown once and only its hash is stored.
 *
 * Written against the web Request/Response API so the same handler runs as
 * Vercel functions and inside the Vite dev server.
 */
import { usernameProblem } from './moderation.js';
import { InvalidSubmission, prepareSubmission, type Submission, type SubmissionInput } from './schema.js';

export interface Keeper {
  name: string;
  createdAt: number;
  keyHash: string;
}

export interface PlaygroundStore {
  list(sort: 'recent' | 'liked', offset: number, limit: number): Promise<Submission[]>;
  listByKeeper(name: string, offset: number, limit: number): Promise<Submission[]>;
  countByKeeper(name: string): Promise<number>;
  get(id: string): Promise<Submission | null>;
  put(sub: Submission): Promise<void>;
  /** Returns the new like count, or null if the submission does not exist. */
  like(id: string, voter: string): Promise<number | null>;
  /** Returns true once enough people have reported it that it is hidden. */
  report(id: string, voter: string): Promise<boolean>;
  /** Removes it if `keeper` shared it. */
  remove(id: string, keeper: string): Promise<boolean>;
  /** False if the name is already taken. */
  createKeeper(k: Keeper): Promise<boolean>;
  getKeeper(name: string): Promise<Keeper | null>;
  /** True if the caller is still under `limit` calls in this window. */
  allow(key: string, limit: number, windowS: number): Promise<boolean>;
}

const PAGE = 24;
const MAX_BODY = 96 * 1024;
const SUBMITS_PER_HOUR = 6;
const KEEPERS_PER_HOUR = 5;
const REPORTS_TO_HIDE = 3;

// ------------------------------------------------------------------ redis

/** Upstash Redis over REST (Vercel's Redis integration sets these variables). */
export async function redisStore(url: string, token: string): Promise<PlaygroundStore> {
  const { Redis } = await import('@upstash/redis');
  const r = new Redis({ url, token });
  const item = (id: string) => `tr:item:${id}`;
  const by = (name: string) => `tr:by:${name}`;
  const withLikes = async (subs: (Submission | null)[]) => {
    const found = subs.filter((s): s is Submission => !!s);
    if (found.length === 0) return [];
    const p = r.pipeline();
    for (const s of found) p.zscore('tr:liked', s.id);
    const likes = (await p.exec()) as (number | null)[];
    return found.map((s, i) => ({ ...s, likes: Number(likes[i] ?? 0) }));
  };
  const fetch = async (ids: string[]) => (ids.length ? withLikes(await r.mget<(Submission | null)[]>(...ids.map(item))) : []);
  const unlist = async (id: string, keeper: string) => {
    const p = r.pipeline();
    p.zrem('tr:recent', id);
    p.zrem('tr:liked', id);
    p.zrem(by(keeper), id);
    await p.exec();
  };
  return {
    async list(sort, offset, limit) {
      return fetch(await r.zrange<string[]>(sort === 'liked' ? 'tr:liked' : 'tr:recent', offset, offset + limit - 1, { rev: true }));
    },
    async listByKeeper(name, offset, limit) {
      return fetch(await r.zrange<string[]>(by(name), offset, offset + limit - 1, { rev: true }));
    },
    async countByKeeper(name) {
      return r.zcard(by(name));
    },
    async get(id) {
      const s = await r.get<Submission>(item(id));
      return s ? (await withLikes([s]))[0]! : null;
    },
    async put(sub) {
      const p = r.pipeline();
      p.set(item(sub.id), sub);
      p.zadd('tr:recent', { score: sub.createdAt, member: sub.id });
      p.zadd('tr:liked', { score: 0, member: sub.id });
      p.zadd(by(sub.keeper), { score: sub.createdAt, member: sub.id });
      await p.exec();
    },
    async like(id, voter) {
      if (!(await r.exists(item(id)))) return null;
      const added = await r.sadd(`tr:voters:${id}`, voter);
      if (added) return Number(await r.zincrby('tr:liked', 1, id));
      return Number((await r.zscore('tr:liked', id)) ?? 0);
    },
    async report(id, voter) {
      const sub = await r.get<Submission>(item(id));
      if (!sub) return false;
      await r.sadd(`tr:reports:${id}`, voter);
      if ((await r.scard(`tr:reports:${id}`)) < REPORTS_TO_HIDE) return false;
      await unlist(id, sub.keeper);
      return true;
    },
    async remove(id, keeper) {
      const sub = await r.get<Submission>(item(id));
      if (!sub || sub.keeper !== keeper) return false;
      await r.del(item(id), `tr:voters:${id}`, `tr:reports:${id}`);
      await unlist(id, keeper);
      return true;
    },
    async createKeeper(k) {
      return (await r.set(`tr:keeper:${k.name}`, k, { nx: true })) === 'OK';
    },
    async getKeeper(name) {
      return r.get<Keeper>(`tr:keeper:${name}`);
    },
    async allow(key, limit, windowS) {
      const k = `tr:rl:${key}:${Math.floor(Date.now() / 1000 / windowS)}`;
      const n = await r.incr(k);
      if (n === 1) await r.expire(k, windowS);
      return n <= limit;
    },
  };
}

// ------------------------------------------------------------------ memory

/** For local development and tests: lives as long as the process. */
export function memoryStore(seed: { keepers?: Keeper[]; subs?: Submission[] } = {}): PlaygroundStore {
  const items = new Map<string, { sub: Submission; voters: Set<string>; reports: Set<string>; hidden: boolean }>();
  const keepers = new Map<string, Keeper>();
  const counters = new Map<string, number>();
  for (const k of seed.keepers ?? []) keepers.set(k.name, k);
  for (const s of seed.subs ?? []) items.set(s.id, { sub: s, voters: new Set(), reports: new Set(), hidden: false });
  const view = (e: { sub: Submission; voters: Set<string> }) => ({ ...e.sub, likes: e.sub.likes + e.voters.size });
  const visible = () => [...items.values()].filter((e) => !e.hidden).map(view);
  return {
    async list(sort, offset, limit) {
      const all = visible();
      all.sort((a, b) => (sort === 'liked' ? b.likes - a.likes || b.createdAt - a.createdAt : b.createdAt - a.createdAt));
      return all.slice(offset, offset + limit);
    },
    async listByKeeper(name, offset, limit) {
      return visible().filter((s) => s.keeper === name).sort((a, b) => b.createdAt - a.createdAt).slice(offset, offset + limit);
    },
    async countByKeeper(name) {
      return visible().filter((s) => s.keeper === name).length;
    },
    async get(id) {
      const e = items.get(id);
      return e ? view(e) : null;
    },
    async put(sub) {
      items.set(sub.id, { sub, voters: new Set(), reports: new Set(), hidden: false });
    },
    async like(id, voter) {
      const e = items.get(id);
      if (!e) return null;
      e.voters.add(voter);
      return view(e).likes;
    },
    async report(id, voter) {
      const e = items.get(id);
      if (!e) return false;
      e.reports.add(voter);
      e.hidden ||= e.reports.size >= REPORTS_TO_HIDE;
      return e.hidden;
    },
    async remove(id, keeper) {
      const e = items.get(id);
      if (!e || e.sub.keeper !== keeper) return false;
      items.delete(id);
      return true;
    },
    async createKeeper(k) {
      if (keepers.has(k.name)) return false;
      keepers.set(k.name, k);
      return true;
    },
    async getKeeper(name) {
      return keepers.get(name) ?? null;
    },
    async allow(key, limit, windowS) {
      const k = `${key}:${Math.floor(Date.now() / 1000 / windowS)}`;
      const n = (counters.get(k) ?? 0) + 1;
      counters.set(k, n);
      return n <= limit;
    },
  };
}

// ------------------------------------------------------------------ keys

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const problem = (status: number, message: string) => json({ error: message }, status);

const ID = /^[a-z0-9]{6,16}$/;
const VOTER = /^[a-z0-9-]{8,64}$/i;
/** Crockford base32: no I, L, O or U, so a code read aloud or copied by hand survives. */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => (b % 36).toString(36)).join('');
}

/** A recovery code like K7Q2M-9XH4T-3BNR8-WD6PA-Z5C1E: 125 random bits. */
export function newRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(25));
  const chars = [...bytes].map((b) => CODE_ALPHABET[b & 31]!).join('');
  return chars.match(/.{5}/g)!.join('-');
}

/** Accept a code however it was typed: any case, with or without dashes or spaces. */
export function normaliseCode(code: string) {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compare two equal-length hex digests without stopping at the first difference. */
function sameDigest(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const normaliseName = (name: unknown) => (typeof name === 'string' ? name.trim().toLowerCase() : '');

async function checkKeeper(store: PlaygroundStore, name: unknown, code: unknown): Promise<string | null> {
  const n = normaliseName(name);
  if (!n || typeof code !== 'string' || !code) return null;
  const k = await store.getKeeper(n);
  if (!k) return null;
  return sameDigest(k.keyHash, await sha256(normaliseCode(code))) ? n : null;
}

const fromHeaders = (store: PlaygroundStore, req: Request) => checkKeeper(store, req.headers.get('x-keeper'), req.headers.get('x-keeper-key'));

function clientKey(req: Request) {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || req.headers.get('x-real-ip') || 'local';
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_BODY) throw new InvalidSubmission('That terrarium is too large to share.');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new InvalidSubmission('That terrarium is too large to share.');
  try {
    const body = JSON.parse(text || '{}');
    return body && typeof body === 'object' ? body : {};
  } catch {
    throw new InvalidSubmission('Could not read the request.');
  }
}

// ------------------------------------------------------------------ handlers

async function keepers(req: Request, url: URL, store: PlaygroundStore): Promise<Response> {
  if (req.method === 'GET') {
    const name = normaliseName(url.searchParams.get('name'));
    const k = name ? await store.getKeeper(name) : null;
    if (!k) return problem(404, 'There is no keeper by that name.');
    return json({ name: k.name, createdAt: k.createdAt, count: await store.countByKeeper(k.name) });
  }
  if (req.method !== 'POST') return problem(405, 'Method not allowed.');
  const body = await readJson(req);

  if (url.searchParams.get('action') === 'verify') {
    if (!(await store.allow(`verify:${clientKey(req)}`, 30, 3600))) return problem(429, 'Too many tries. Wait a while and try again.');
    const name = await checkKeeper(store, body.name, body.key);
    return name ? json({ name }) : problem(401, 'That name and recovery code do not match.');
  }

  const name = normaliseName(body.name);
  const why = usernameProblem(name);
  if (why) return problem(400, why);
  if (!(await store.allow(`keeper:${clientKey(req)}`, KEEPERS_PER_HOUR, 3600))) return problem(429, 'You have made several names in the last hour. Try again later.');
  const key = newRecoveryCode();
  const created = await store.createKeeper({ name, createdAt: Date.now(), keyHash: await sha256(normaliseCode(key)) });
  if (!created) return problem(409, 'That name is taken.');
  return json({ name, key }, 201);
}

async function terrariums(req: Request, url: URL, store: PlaygroundStore): Promise<Response> {
  const id = url.searchParams.get('id');
  if (id !== null && !ID.test(id)) return problem(400, 'Bad id.');

  if (req.method === 'GET') {
    if (id) {
      const s = await store.get(id);
      return s ? json(s) : problem(404, 'That terrarium is no longer on the shelf.');
    }
    const offset = Math.max(0, Math.min(10_000, Number(url.searchParams.get('cursor')) || 0));
    const keeper = normaliseName(url.searchParams.get('keeper'));
    const items = keeper
      ? await store.listByKeeper(keeper, offset, PAGE)
      : await store.list(url.searchParams.get('sort') === 'liked' ? 'liked' : 'recent', offset, PAGE);
    return json({ items, next: items.length === PAGE ? offset + PAGE : null }, 200, { 'cache-control': 'public, max-age=10, stale-while-revalidate=60' });
  }

  if (req.method === 'POST' && !id) {
    const keeper = await fromHeaders(store, req);
    if (!keeper) return problem(401, 'Pick a username first, or sign in with your recovery code.');
    if (!(await store.allow(`submit:${keeper}`, SUBMITS_PER_HOUR, 3600))) {
      return problem(429, 'You have shared a lot in the last hour. Try again later.');
    }
    const body = (await readJson(req)) as unknown as SubmissionInput;
    const sub = prepareSubmission(body, newId(), Date.now(), keeper);
    await store.put(sub);
    return json({ item: sub }, 201);
  }

  if (req.method === 'POST' && id) {
    const action = url.searchParams.get('action');
    const { voter } = await readJson(req);
    if (typeof voter !== 'string' || !VOTER.test(voter)) return problem(400, 'Bad voter.');
    if (!(await store.allow(`vote:${clientKey(req)}`, 120, 3600))) return problem(429, 'Slow down a little.');
    if (action === 'like') {
      const likes = await store.like(id, voter);
      return likes === null ? problem(404, 'Not found.') : json({ likes });
    }
    if (action === 'report') return json({ hidden: await store.report(id, voter) });
    return problem(400, 'Unknown action.');
  }

  if (req.method === 'DELETE' && id) {
    const keeper = await fromHeaders(store, req);
    if (!keeper) return problem(401, 'Sign in to remove your terrariums.');
    return (await store.remove(id, keeper)) ? json({ ok: true }) : problem(403, 'Only the keeper who shared it can remove it.');
  }

  return problem(405, 'Method not allowed.');
}

/** Routes /api/keepers and /api/terrariums. */
export async function handle(req: Request, store: PlaygroundStore | null): Promise<Response> {
  if (!store) return problem(503, 'The community shelf is not connected to storage yet.');
  const url = new URL(req.url);
  try {
    if (url.pathname.endsWith('/keepers')) return await keepers(req, url, store);
    return await terrariums(req, url, store);
  } catch (e) {
    if (e instanceof InvalidSubmission) return problem(400, e.message);
    console.error(e);
    return problem(500, 'Something went wrong.');
  }
}

/** The store configured by the environment, or null when none is set. */
export async function storeFromEnv(env: Record<string, string | undefined>): Promise<PlaygroundStore | null> {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? redisStore(url, token) : null;
}

