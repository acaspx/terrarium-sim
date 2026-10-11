import type { TerrariumSpec } from '../engine/index.js';
import type { Submission } from '../playground/schema.js';
import type { JarRecord } from './store.js';

export type { Submission };

const API = '/api/terrariums';
const OWNED_KEY = 'terrarium-sim:shared';
const VOTER_KEY = 'terrarium-sim:voter';
const LIKED_KEY = 'terrarium-sim:liked';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the feature still works for this visit.
  }
}

/** An anonymous id so a visitor's like counts once. Not tied to anything else. */
function voter() {
  let v = readJson<string | null>(VOTER_KEY, null);
  if (!v) {
    v = crypto.randomUUID();
    writeJson(VOTER_KEY, v);
  }
  return v;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  } catch {
    throw new Error('Could not reach the playground. Check your connection.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `The playground answered ${res.status}.`);
  return body as T;
}

export function listShared(sort: 'recent' | 'liked', cursor = 0) {
  return request<{ items: Submission[]; next: number | null }>(`?sort=${sort}&cursor=${cursor}`);
}

export function getShared(id: string) {
  return request<Submission>(`?id=${encodeURIComponent(id)}`);
}

export async function share(j: JarRecord, author: string, note: string) {
  const { item, deleteToken } = await request<{ item: Submission; deleteToken: string }>('', {
    method: 'POST',
    body: JSON.stringify({ spec: j.spec, state: { ...j.state, events: j.state.events.slice(-12) }, author, note }),
  });
  const owned = readJson<Record<string, { token: string; jar: string }>>(OWNED_KEY, {});
  owned[item.id] = { token: deleteToken, jar: j.id };
  writeJson(OWNED_KEY, owned);
  return item;
}

/** Submissions this browser shared, by jar id. */
export function sharedFrom(jarId: string): string[] {
  const owned = readJson<Record<string, { token: string; jar: string }>>(OWNED_KEY, {});
  return Object.entries(owned).filter(([, v]) => v.jar === jarId).map(([id]) => id);
}

export function isMine(id: string) {
  return !!readJson<Record<string, unknown>>(OWNED_KEY, {})[id];
}

export async function unshare(id: string) {
  const owned = readJson<Record<string, { token: string; jar: string }>>(OWNED_KEY, {});
  const mine = owned[id];
  if (!mine) throw new Error('Only the browser that shared it can remove it.');
  await request(`?id=${id}`, { method: 'DELETE', headers: { 'x-delete-token': mine.token } });
  delete owned[id];
  writeJson(OWNED_KEY, owned);
}

export function hasLiked(id: string) {
  return readJson<string[]>(LIKED_KEY, []).includes(id);
}

export async function like(id: string) {
  const { likes } = await request<{ likes: number }>(`?id=${id}&action=like`, { method: 'POST', body: JSON.stringify({ voter: voter() }) });
  writeJson(LIKED_KEY, [...new Set([...readJson<string[]>(LIKED_KEY, []), id])]);
  return likes;
}

export function report(id: string) {
  return request<{ hidden: boolean }>(`?id=${id}&action=report`, { method: 'POST', body: JSON.stringify({ voter: voter() }) });
}

/** Hand a design to the builder. */
export function plantCopy(spec: TerrariumSpec, from: string) {
  try {
    sessionStorage.setItem('terrarium-sim:draft', JSON.stringify({ ...spec, name: `${spec.name} (from ${from})`.slice(0, 40) }));
  } catch {
    // Without session storage the builder opens on its default recipe.
  }
  location.hash = '#/new?draft=1';
}
