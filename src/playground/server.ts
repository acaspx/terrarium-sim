/**
 * The playground API: a public gallery of terrariums people have shared.
 *
 *   GET    /api/terrariums?sort=recent|liked&cursor=N   a page of submissions
 *   GET    /api/terrariums?id=ID                         one submission
 *   POST   /api/terrariums                               share { spec, state, author?, note? }
 *   POST   /api/terrariums?id=ID&action=like|report      { voter }
 *   DELETE /api/terrariums?id=ID                         header x-delete-token
 *
 * Written against the web Request/Response API so the same handler runs as a
 * Vercel function and inside the Vite dev server.
 */
import { InvalidSubmission, prepareSubmission, type Submission, type SubmissionInput } from './schema.js';

export interface PlaygroundStore {
  list(sort: 'recent' | 'liked', offset: number, limit: number): Promise<Submission[]>;
  get(id: string): Promise<Submission | null>;
  put(sub: Submission, tokenHash: string): Promise<void>;
  /** Returns the new like count, or null if the submission does not exist. */
  like(id: string, voter: string): Promise<number | null>;
  /** Returns true once enough people have reported it that it is hidden. */
  report(id: string, voter: string): Promise<boolean>;
  remove(id: string, tokenHash: string): Promise<boolean>;
  /** True if the caller is still under `limit` calls in this window. */
  allow(key: string, limit: number, windowS: number): Promise<boolean>;
}

const PAGE = 24;
const MAX_BODY = 96 * 1024;
const SUBMITS_PER_HOUR = 6;
const REPORTS_TO_HIDE = 3;

// ------------------------------------------------------------------ redis

/** Upstash Redis over REST (Vercel's Redis integration sets these variables). */
export async function redisStore(url: string, token: string): Promise<PlaygroundStore> {
  const { Redis } = await import('@upstash/redis');
  const r = new Redis({ url, token });
  const item = (id: string) => `tr:item:${id}`;
  const withLikes = async (subs: (Submission | null)[]) => {
    const found = subs.filter((s): s is Submission => !!s);
    if (found.length === 0) return [];
    const p = r.pipeline();
    for (const s of found) p.zscore('tr:liked', s.id);
    const likes = (await p.exec()) as (number | null)[];
    return found.map((s, i) => ({ ...s, likes: Number(likes[i] ?? 0) }));
  };
  return {
    async list(sort, offset, limit) {
      const ids = await r.zrange<string[]>(sort === 'liked' ? 'tr:liked' : 'tr:recent', offset, offset + limit - 1, { rev: true });
      if (ids.length === 0) return [];
      return withLikes(await r.mget<(Submission | null)[]>(...ids.map(item)));
    },
    async get(id) {
      const s = await r.get<Submission>(item(id));
      return s ? (await withLikes([s]))[0]! : null;
    },
    async put(sub, tokenHash) {
      const p = r.pipeline();
      p.set(item(sub.id), sub);
      p.set(`tr:token:${sub.id}`, tokenHash);
      p.zadd('tr:recent', { score: sub.createdAt, member: sub.id });
      p.zadd('tr:liked', { score: 0, member: sub.id });
      await p.exec();
    },
    async like(id, voter) {
      if (!(await r.exists(item(id)))) return null;
      const added = await r.sadd(`tr:voters:${id}`, voter);
      if (added) return Number(await r.zincrby('tr:liked', 1, id));
      return Number((await r.zscore('tr:liked', id)) ?? 0);
    },
    async report(id, voter) {
      await r.sadd(`tr:reports:${id}`, voter);
      const n = await r.scard(`tr:reports:${id}`);
      if (n >= REPORTS_TO_HIDE) {
        await r.zrem('tr:recent', id);
        await r.zrem('tr:liked', id);
        return true;
      }
      return false;
    },
    async remove(id, tokenHash) {
      const stored = await r.get<string>(`tr:token:${id}`);
      if (!stored || stored !== tokenHash) return false;
      await r.del(item(id), `tr:token:${id}`, `tr:voters:${id}`, `tr:reports:${id}`);
      await r.zrem('tr:recent', id);
      await r.zrem('tr:liked', id);
      return true;
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

/** For local development: lives as long as the dev server. */
export function memoryStore(seed: Submission[] = []): PlaygroundStore {
  const items = new Map<string, { sub: Submission; token: string; voters: Set<string>; reports: Set<string>; hidden: boolean }>();
  const counters = new Map<string, number>();
  for (const s of seed) items.set(s.id, { sub: s, token: '', voters: new Set(), reports: new Set(), hidden: false });
  const view = (e: { sub: Submission; voters: Set<string> }) => ({ ...e.sub, likes: e.sub.likes + e.voters.size });
  return {
    async list(sort, offset, limit) {
      const all = [...items.values()].filter((e) => !e.hidden).map(view);
      all.sort((a, b) => (sort === 'liked' ? b.likes - a.likes || b.createdAt - a.createdAt : b.createdAt - a.createdAt));
      return all.slice(offset, offset + limit);
    },
    async get(id) {
      const e = items.get(id);
      return e ? view(e) : null;
    },
    async put(sub, token) {
      items.set(sub.id, { sub, token, voters: new Set(), reports: new Set(), hidden: false });
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
    async remove(id, token) {
      const e = items.get(id);
      if (!e || !e.token || e.token !== token) return false;
      items.delete(id);
      return true;
    },
    async allow(key, limit, windowS) {
      const k = `${key}:${Math.floor(Date.now() / 1000 / windowS)}`;
      const n = (counters.get(k) ?? 0) + 1;
      counters.set(k, n);
      return n <= limit;
    },
  };
}

// ------------------------------------------------------------------ handler

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const problem = (status: number, message: string) => json({ error: message }, status);

const ID = /^[a-z0-9]{6,16}$/;
const VOTER = /^[a-z0-9-]{8,64}$/i;

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => (b % 36).toString(36)).join('');
}

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function clientKey(req: Request) {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || req.headers.get('x-real-ip') || 'local';
}

async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_BODY) throw new InvalidSubmission('That terrarium is too large to share.');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new InvalidSubmission('That terrarium is too large to share.');
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new InvalidSubmission('Could not read the request.');
  }
}

export async function handle(req: Request, store: PlaygroundStore | null): Promise<Response> {
  if (!store) return problem(503, 'The playground is not connected to storage yet.');
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (id !== null && !ID.test(id)) return problem(400, 'Bad id.');

  try {
    if (req.method === 'GET') {
      if (id) {
        const s = await store.get(id);
        return s ? json(s) : problem(404, 'That terrarium is no longer in the playground.');
      }
      const sort = url.searchParams.get('sort') === 'liked' ? 'liked' : 'recent';
      const offset = Math.max(0, Math.min(10_000, Number(url.searchParams.get('cursor')) || 0));
      const items = await store.list(sort, offset, PAGE);
      return json({ items, next: items.length === PAGE ? offset + PAGE : null }, 200, { 'cache-control': 'public, max-age=10, stale-while-revalidate=60' });
    }

    if (req.method === 'POST' && !id) {
      if (!(await store.allow(`submit:${clientKey(req)}`, SUBMITS_PER_HOUR, 3600))) {
        return problem(429, 'You have shared a lot in the last hour. Try again later.');
      }
      const body = (await readJson(req)) as SubmissionInput;
      const sub = prepareSubmission(body, newId(), Date.now());
      const token = crypto.randomUUID();
      await store.put(sub, await sha256(token));
      return json({ item: sub, deleteToken: token }, 201);
    }

    if (req.method === 'POST' && id) {
      const action = url.searchParams.get('action');
      const { voter } = (await readJson(req)) as { voter?: unknown };
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
      const token = req.headers.get('x-delete-token');
      if (!token) return problem(401, 'Missing token.');
      return (await store.remove(id, await sha256(token))) ? json({ ok: true }) : problem(403, 'Only the person who shared it can remove it.');
    }

    return problem(405, 'Method not allowed.');
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
