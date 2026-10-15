/**
 * The community shelf API: keepers claim a username, then share terrariums
 * they are proud of to a public shelf that anyone can browse.
 *
 *   GET    /api/keepers?name=NAME                        a keeper's profile
 *   POST   /api/keepers                                  claim { name } -> { name, key }
 *   POST   /api/keepers?action=verify                    sign in on another device { name, key }
 *   GET    /api/keepers?action=following                 who you follow                    (keeper only)
 *   POST   /api/keepers?action=follow|unfollow           { name }                          (keeper only)
 *
 *   GET    /api/terrariums?sort=recent|liked&cursor=N    a page of the community shelf
 *   GET    /api/terrariums?keeper=NAME&cursor=N          one keeper's shelf
 *   GET    /api/terrariums?feed=following&cursor=N       jars from keepers you follow      (keeper only)
 *   GET    /api/terrariums?id=ID                         one terrarium
 *   POST   /api/terrariums                               share { spec, state, note? }      (keeper only)
 *   POST   /api/terrariums?id=ID&action=like|report      { voter }                         (anyone)
 *   DELETE /api/terrariums?id=ID                                                           (its keeper, or a moderator)
 *   POST   /api/terrariums?id=ID&action=card             { image } a JPEG preview card     (its keeper only)
 *   GET    /api/terrariums?id=ID&card=1                  the preview card
 *   POST   /api/keepers?action=ban                       { name } removes all their jars   (moderators only)
 *   GET    /api/share?id=ID   (served at /s/ID)          a page with link-preview tags that opens the jar
 *
 * Moderators are the usernames listed in the MODERATORS environment variable.
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
  /** Set by a moderator: the name cannot sign in or share, and its jars are gone. */
  banned?: boolean;
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
  /** Removes it if `keeper` shared it; null removes it whoever did. */
  remove(id: string, keeper: string | null): Promise<boolean>;
  /** Marks the keeper banned and removes all their jars. */
  ban(name: string): Promise<void>;
  /** A jar's link-preview image, base64 JPEG. */
  setCard(id: string, base64: string): Promise<void>;
  getCard(id: string): Promise<string | null>;
  /** False if the name is already taken. */
  createKeeper(k: Keeper): Promise<boolean>;
  getKeeper(name: string): Promise<Keeper | null>;
  follow(follower: string, name: string): Promise<void>;
  unfollow(follower: string, name: string): Promise<void>;
  /** Who this keeper follows. */
  following(name: string): Promise<string[]>;
  followerCount(name: string): Promise<number>;
  /** The newest jars shared by any of these keepers. */
  feed(names: string[], offset: number, limit: number): Promise<Submission[]>;
  /** True if the caller is still under `limit` calls in this window. */
  allow(key: string, limit: number, windowS: number): Promise<boolean>;
}

const PAGE = 24;
// Room for a jar and a year of weekly frames.
const MAX_BODY = 256 * 1024;
const SUBMITS_PER_HOUR = 6;
const KEEPERS_PER_HOUR = 5;
const REPORTS_TO_HIDE = 3;
/** Keeps the following feed a bounded merge of shelves. */
export const MAX_FOLLOWING = 200;
const FOLLOWS_PER_HOUR = 120;

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
  const remove = async (id: string, keeper: string | null) => {
    const sub = await r.get<Submission>(item(id));
    if (!sub || (keeper !== null && sub.keeper !== keeper)) return false;
    await r.del(item(id), `tr:voters:${id}`, `tr:reports:${id}`, `tr:card:${id}`);
    await unlist(id, sub.keeper);
    return true;
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
    remove,
    async ban(name) {
      const k = await r.get<Keeper>(`tr:keeper:${name}`);
      if (!k) return;
      await r.set(`tr:keeper:${name}`, { ...k, banned: true });
      for (const id of await r.zrange<string[]>(by(name), 0, -1)) await remove(String(id), null);
    },
    async setCard(id, base64) {
      await r.set(`tr:card:${id}`, base64);
    },
    async getCard(id) {
      return r.get<string>(`tr:card:${id}`);
    },
    async createKeeper(k) {
      return (await r.set(`tr:keeper:${k.name}`, k, { nx: true })) === 'OK';
    },
    async getKeeper(name) {
      return r.get<Keeper>(`tr:keeper:${name}`);
    },
    async follow(follower, name) {
      const p = r.pipeline();
      p.sadd(`tr:following:${follower}`, name);
      p.sadd(`tr:followers:${name}`, follower);
      await p.exec();
    },
    async unfollow(follower, name) {
      const p = r.pipeline();
      p.srem(`tr:following:${follower}`, name);
      p.srem(`tr:followers:${name}`, follower);
      await p.exec();
    },
    async following(name) {
      return (await r.smembers(`tr:following:${name}`)).sort();
    },
    async followerCount(name) {
      return r.scard(`tr:followers:${name}`);
    },
    async feed(names, offset, limit) {
      if (names.length === 0) return [];
      // The newest offset+limit of each shelf is enough to find the newest offset+limit overall.
      const p = r.pipeline();
      for (const n of names) p.zrange(by(n), 0, offset + limit - 1, { rev: true, withScores: true });
      const shelves = (await p.exec()) as (string | number)[][];
      const all: { id: string; at: number }[] = [];
      for (const flat of shelves) for (let i = 0; i + 1 < flat.length; i += 2) all.push({ id: String(flat[i]), at: Number(flat[i + 1]) });
      all.sort((a, b) => b.at - a.at);
      return fetch(all.slice(offset, offset + limit).map((e) => e.id));
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
  const follows = new Map<string, Set<string>>();
  const cards = new Map<string, string>();
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
      if (!e || (keeper !== null && e.sub.keeper !== keeper)) return false;
      items.delete(id);
      cards.delete(id);
      return true;
    },
    async ban(name) {
      const k = keepers.get(name);
      if (!k) return;
      keepers.set(name, { ...k, banned: true });
      for (const [id, e] of items) if (e.sub.keeper === name) await this.remove(id, null);
    },
    async setCard(id, base64) {
      cards.set(id, base64);
    },
    async getCard(id) {
      return cards.get(id) ?? null;
    },
    async createKeeper(k) {
      if (keepers.has(k.name)) return false;
      keepers.set(k.name, k);
      return true;
    },
    async getKeeper(name) {
      return keepers.get(name) ?? null;
    },
    async follow(follower, name) {
      follows.set(follower, (follows.get(follower) ?? new Set()).add(name));
    },
    async unfollow(follower, name) {
      follows.get(follower)?.delete(name);
    },
    async following(name) {
      return [...(follows.get(name) ?? [])].sort();
    },
    async followerCount(name) {
      return [...follows.values()].filter((f) => f.has(name)).length;
    },
    async feed(names, offset, limit) {
      const set = new Set(names);
      return visible().filter((s) => set.has(s.keeper)).sort((a, b) => b.createdAt - a.createdAt).slice(offset, offset + limit);
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
  if (!k || k.banned) return null;
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

async function keepers(req: Request, url: URL, store: PlaygroundStore, mods: Set<string>): Promise<Response> {
  if (req.method === 'GET') {
    if (url.searchParams.get('action') === 'following') {
      const me = await fromHeaders(store, req);
      return me ? json({ names: await store.following(me), moderator: mods.has(me) }) : problem(401, 'Sign in to see who you follow.');
    }
    const name = normaliseName(url.searchParams.get('name'));
    const k = name ? await store.getKeeper(name) : null;
    if (!k || k.banned) return problem(404, 'There is no keeper by that name.');
    const [count, followers] = await Promise.all([store.countByKeeper(k.name), store.followerCount(k.name)]);
    return json({ name: k.name, createdAt: k.createdAt, count, followers });
  }
  if (req.method !== 'POST') return problem(405, 'Method not allowed.');
  const body = await readJson(req);
  const action = url.searchParams.get('action');

  if (action === 'ban') {
    const me = await fromHeaders(store, req);
    if (!me || !mods.has(me)) return problem(403, 'Only moderators can do that.');
    const name = normaliseName(body.name);
    if (mods.has(name)) return problem(400, 'Moderators cannot be banned here; take them off MODERATORS first.');
    if (!(await store.getKeeper(name))) return problem(404, 'There is no keeper by that name.');
    await store.ban(name);
    return json({ banned: name });
  }

  if (action === 'follow' || action === 'unfollow') {
    const me = await fromHeaders(store, req);
    if (!me) return problem(401, 'Pick a username first, or sign in with your recovery code.');
    const name = normaliseName(body.name);
    if (!(await store.allow(`follow:${me}`, FOLLOWS_PER_HOUR, 3600))) return problem(429, 'Slow down a little.');
    if (action === 'unfollow') {
      await store.unfollow(me, name);
      return json({ following: false, followers: await store.followerCount(name) });
    }
    if (name === me) return problem(400, 'You cannot follow yourself.');
    if (!(await store.getKeeper(name))) return problem(404, 'There is no keeper by that name.');
    const already = await store.following(me);
    if (!already.includes(name) && already.length >= MAX_FOLLOWING) return problem(400, `You can follow up to ${MAX_FOLLOWING} keepers.`);
    await store.follow(me, name);
    return json({ following: true, followers: await store.followerCount(name) });
  }

  if (action === 'verify') {
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

/** A page of a list. Lists leave the time-lapse frames out; opening one jar fetches them. */
function listing(page: Submission[], offset: number) {
  const items = page.map(({ frames, ...s }) => ({ ...s, frameCount: s.frameCount ?? frames?.length ?? 0 }));
  return { items, next: items.length === PAGE ? offset + PAGE : null };
}

/** Room for a 1200 x 630 JPEG, base64. */
const MAX_CARD = 200_000;
const CARD = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/;

async function terrariums(req: Request, url: URL, store: PlaygroundStore, mods: Set<string>): Promise<Response> {
  const id = url.searchParams.get('id');
  if (id !== null && !ID.test(id)) return problem(400, 'Bad id.');

  if (req.method === 'GET') {
    if (id && url.searchParams.has('card')) {
      const card = await store.getCard(id);
      if (!card) return problem(404, 'No picture for that terrarium.');
      // A jar's card never changes: sharing again makes a new jar id.
      return new Response(Uint8Array.from(atob(card), (c) => c.charCodeAt(0)), {
        headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' },
      });
    }
    if (id) {
      const s = await store.get(id);
      return s ? json(s) : problem(404, 'That terrarium is no longer on the shelf.');
    }
    const offset = Math.max(0, Math.min(10_000, Number(url.searchParams.get('cursor')) || 0));
    if (url.searchParams.get('feed') === 'following') {
      const me = await fromHeaders(store, req);
      if (!me) return problem(401, 'Sign in to see jars from keepers you follow.');
      // Personal, so never cached by anything in between.
      return json(listing(await store.feed(await store.following(me), offset, PAGE), offset));
    }
    const keeper = normaliseName(url.searchParams.get('keeper'));
    const page = keeper
      ? await store.listByKeeper(keeper, offset, PAGE)
      : await store.list(url.searchParams.get('sort') === 'liked' ? 'liked' : 'recent', offset, PAGE);
    return json(listing(page, offset), 200, { 'cache-control': 'public, max-age=10, stale-while-revalidate=60' });
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

  if (req.method === 'POST' && id && url.searchParams.get('action') === 'card') {
    const keeper = await fromHeaders(store, req);
    const sub = keeper ? await store.get(id) : null;
    if (!sub || sub.keeper !== keeper) return problem(403, 'Only the keeper who shared it can add its picture.');
    const { image } = await readJson(req);
    const m = typeof image === 'string' && image.length <= MAX_CARD ? CARD.exec(image) : null;
    if (!m) return problem(400, 'The picture must be a JPEG under 150 KB.');
    await store.setCard(id, m[1]!);
    return json({ ok: true });
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
    return (await store.remove(id, mods.has(keeper) ? null : keeper)) ? json({ ok: true }) : problem(403, 'Only the keeper who shared it can remove it.');
  }

  return problem(405, 'Method not allowed.');
}

const escape = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * /s/ID: what a chat app or social site sees when a jar's link is pasted (the jar's page
 * itself lives after a #, which never reaches a server), and a doorway into the app for people.
 */
async function sharePage(req: Request, url: URL, store: PlaygroundStore | null): Promise<Response> {
  const id = url.searchParams.get('id') ?? '';
  const target = ID.test(id) ? `/#/community/${id}` : '/#/community';
  const sub = store && ID.test(id) ? await store.get(id) : null;
  const host = req.headers.get('x-forwarded-host') ?? url.host;
  const origin = `${req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')}://${host}`;
  const title = sub ? `${sub.spec.name} by @${sub.keeper}` : 'Terrarium';
  const description = sub ? sub.note || `A living terrarium on the community shelf, day ${sub.day}. Look inside, or plant a copy.` : 'Build terrariums and watch them live.';
  const card = sub && (await store!.getCard(id)) ? `${origin}/api/terrariums?id=${id}&card=1` : null;
  const meta = [
    ['og:title', title], ['og:description', description], ['og:type', 'website'], ['og:url', `${origin}/s/${id}`],
    ...(card ? [['og:image', card], ['og:image:width', '1200'], ['og:image:height', '630']] : []),
    ['twitter:card', card ? 'summary_large_image' : 'summary'],
  ].map(([k, v]) => `<meta property="${k}" content="${escape(v!)}">`).join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
${meta}
<meta http-equiv="refresh" content="0; url=${target}"></head>
<body><script>location.replace(${JSON.stringify(target)})</script><a href="${target}">Open ${escape(title)}</a></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}

export interface HandleOptions {
  /** Explains a missing store, for whoever is setting up the deployment. */
  why?: string;
  /** Usernames that may remove any jar and ban keepers. */
  moderators?: string[];
}

/** Routes /api/keepers, /api/terrariums and /api/share. */
export async function handle(req: Request, store: PlaygroundStore | null, opts: HandleOptions = {}): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname.endsWith('/share')) return sharePage(req, url, store);
  if (!store) return json({ error: 'The community shelf is not connected to storage yet.', ...(opts.why ? { setup: opts.why } : {}) }, 503);
  const mods = new Set((opts.moderators ?? []).map(normaliseName).filter(Boolean));
  try {
    if (url.pathname.endsWith('/keepers')) return await keepers(req, url, store, mods);
    return await terrariums(req, url, store, mods);
  } catch (e) {
    if (e instanceof InvalidSubmission) return problem(400, e.message);
    console.error(e);
    return problem(500, 'Something went wrong.');
  }
}

type Env = Record<string, string | undefined>;
export type StorageConfig = { url: string; token: string; from: string } | { problem: string };

/**
 * Finds the Upstash REST address and token, under whichever names the deployment has them:
 * KV_REST_API_URL/TOKEN (Vercel's integration), UPSTASH_REDIS_REST_URL/TOKEN (Upstash's own),
 * either with a prefix (Vercel adds one when it was asked to), or else an Upstash redis:// URL,
 * whose password is also its REST token.
 */
export function storageConfig(env: Env): StorageConfig {
  const names = Object.keys(env).filter((k) => env[k]);
  for (const suffix of ['KV_REST_API', 'UPSTASH_REDIS_REST']) {
    const urlKey = [`${suffix}_URL`, ...names.filter((k) => k.endsWith(`_${suffix}_URL`)).sort()].find((k) => env[k] && env[k.replace(/_URL$/, '_TOKEN')]);
    if (urlKey) return { url: env[urlKey]!, token: env[urlKey.replace(/_URL$/, '_TOKEN')]!, from: urlKey };
  }
  const redisKeys = names.filter((k) => /(^|_)(REDIS_URL|KV_URL)$/.test(k)).sort();
  for (const k of redisKeys) {
    try {
      const u = new URL(env[k]!);
      if (/^rediss?:$/.test(u.protocol) && u.hostname.endsWith('.upstash.io') && u.password) {
        return { url: `https://${u.hostname}`, token: decodeURIComponent(u.password), from: k };
      }
    } catch {
      // Not a URL; reported below.
    }
  }
  // Names only, never values: enough to tell what the deployment was given.
  const seen = names.filter((k) => /KV|REDIS|UPSTASH/i.test(k)).sort();
  if (seen.length === 0) return { problem: 'This deployment has no storage settings. Connect an Upstash Redis database to the project, for Production too, then redeploy.' };
  if (redisKeys.length) return { problem: `Found ${seen.join(', ')}, but no Upstash REST address and token, and ${redisKeys.join(', ')} does not point to Upstash. The shelf needs an Upstash Redis database.` };
  return { problem: `Found ${seen.join(', ')}, but no matching REST address and token pair.` };
}

/** Handler options from the environment: why storage is missing, and who moderates. */
export function optionsFromEnv(env: Env): HandleOptions {
  const c = storageConfig(env);
  return { why: 'problem' in c ? c.problem : undefined, moderators: (env.MODERATORS ?? '').split(/[\s,]+/) };
}

/** The store configured by the environment, or null (with the reason) when there is none. */
export async function storeFromEnv(env: Env): Promise<PlaygroundStore | null> {
  const c = storageConfig(env);
  return 'url' in c ? redisStore(c.url, c.token) : null;
}
