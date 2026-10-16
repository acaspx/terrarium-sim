import { useSyncExternalStore } from 'react';
import type { TerrariumSpec } from '../engine/index.js';
import type { Submission } from '../playground/schema.js';
import type { JarRecord } from './store.js';

export type { Submission };

/** Who you are on the community shelf: your username and the recovery code that proves it. */
export interface Identity {
  name: string;
  key: string;
}
export interface KeeperProfile {
  name: string;
  createdAt: number;
  count: number;
  followers: number;
}

const IDENTITY_KEY = 'terrarium-sim:keeper';
const SHARED_KEY = 'terrarium-sim:shared-from';
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
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: it still works for this visit.
  }
}

// ------------------------------------------------------------------ identity

let identity: Identity | null = readJson<Identity | null>(IDENTITY_KEY, null);
const listeners = new Set<() => void>();
function setIdentity(next: Identity | null) {
  identity = next;
  writeJson(IDENTITY_KEY, next);
  for (const fn of listeners) fn();
}

/** The signed-in keeper on this browser, kept in step across components. */
export function useIdentity(): Identity | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => identity,
  );
}

const auth = (): Record<string, string> => (identity ? { 'x-keeper': identity.name, 'x-keeper-key': identity.key } : {});

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    // Always fresh: right after sharing or removing, a cached list would show the shelf as it was.
    res = await fetch(`/api/${path}`, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  } catch {
    throw new Error('Could not reach the community shelf. Check your connection.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `The community shelf answered ${res.status}.`);
  return body as T;
}

/** Claim a username. Returns the recovery code, which is shown once. */
export async function claimName(name: string): Promise<Identity> {
  const me = await request<Identity>('keepers', { method: 'POST', body: JSON.stringify({ name }) });
  setIdentity(me);
  return me;
}

/** Sign in on this browser with a username and its recovery code. */
export async function signIn(name: string, key: string): Promise<Identity> {
  const { name: confirmed } = await request<{ name: string }>('keepers?action=verify', { method: 'POST', body: JSON.stringify({ name, key }) });
  const me = { name: confirmed, key: key.trim() };
  setIdentity(me);
  return me;
}

export function signOut() {
  setIdentity(null);
}

/** Delete the account on the server (its shared jars go too), then sign out here. */
export async function deleteAccount() {
  await request('keepers', { method: 'DELETE', headers: auth() });
  setIdentity(null);
}

// ------------------------------------------------------------------ following

/** Who the signed-in keeper follows; null until it has loaded (or when signed out). */
let following: { owner: string; names: Set<string>; moderator: boolean } | null = null;
let loadingFollows: string | null = null;
const followListeners = new Set<() => void>();
function setFollowing(next: typeof following) {
  following = next;
  for (const fn of followListeners) fn();
}

function loadFollowing() {
  const me = identity;
  if (!me || loadingFollows === me.name || following?.owner === me.name) return;
  loadingFollows = me.name;
  request<{ names: string[]; moderator?: boolean }>('keepers?action=following', { headers: auth() })
    .then(({ names, moderator }) => identity?.name === me.name && setFollowing({ owner: me.name, names: new Set(names), moderator: !!moderator }))
    .catch(() => {
      // Follow buttons stay hidden until the list loads; the next visit tries again.
    })
    .finally(() => {
      loadingFollows = null;
    });
}

/** The keepers you follow, or null while signed out or still loading. */
export function useFollowing(): Set<string> | null {
  return useMine()?.names ?? null;
}

/** Whether the signed-in keeper is a moderator (listed in MODERATORS on the server). */
export function useModerator(): boolean {
  return useMine()?.moderator ?? false;
}

function useMine() {
  const me = useIdentity();
  const f = useSyncExternalStore(
    (fn) => {
      followListeners.add(fn);
      return () => followListeners.delete(fn);
    },
    () => following,
  );
  if (!me) return null;
  if (f?.owner !== me.name) {
    loadFollowing();
    return null;
  }
  return f;
}

/** Follow or unfollow a keeper. Returns their new follower count. */
export async function setFollow(name: string, on: boolean): Promise<number> {
  const { followers } = await request<{ followers: number }>(`keepers?action=${on ? 'follow' : 'unfollow'}`, {
    method: 'POST', headers: auth(), body: JSON.stringify({ name }),
  });
  if (identity && following?.owner === identity.name) {
    const names = new Set(following.names);
    if (on) names.add(name);
    else names.delete(name);
    setFollowing({ ...following, names });
  }
  return followers;
}

/** Moderators only: remove all of a keeper's jars and stop the name signing in. */
export function ban(name: string) {
  return request(`keepers?action=ban`, { method: 'POST', headers: auth(), body: JSON.stringify({ name }) });
}

/** The link to give people: it shows a preview in chat apps, then opens the jar. */
export const shareLink = (id: string) => `${location.origin}/s/${id}`;

export function listFollowingFeed(cursor = 0) {
  return request<{ items: Submission[]; next: number | null }>(`terrariums?feed=following&cursor=${cursor}`, { headers: auth() });
}

export function getKeeper(name: string) {
  return request<KeeperProfile>(`keepers?name=${encodeURIComponent(name)}`);
}

// ------------------------------------------------------------------ shelf

export function listShared(sort: 'recent' | 'liked', cursor = 0) {
  return request<{ items: Submission[]; next: number | null }>(`terrariums?sort=${sort}&cursor=${cursor}`);
}

export function listByKeeper(name: string, cursor = 0) {
  return request<{ items: Submission[]; next: number | null }>(`terrariums?keeper=${encodeURIComponent(name)}&cursor=${cursor}`);
}

export function getShared(id: string) {
  return request<Submission>(`terrariums?id=${encodeURIComponent(id)}`);
}

export async function share(j: JarRecord, note: string) {
  const { item } = await request<{ item: Submission }>('terrariums', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ spec: j.spec, state: { ...j.state, events: j.state.events.slice(-12) }, frames: j.frames ?? [], note }),
  });
  const from = readJson<Record<string, string>>(SHARED_KEY, {});
  from[item.id] = j.id;
  writeJson(SHARED_KEY, from);
  // The link-preview picture follows in the background; a jar without one still shares.
  void import('./shareCard.js')
    .then((m) => m.shareCard(item.id, item.spec, item.state, item.keeper, item.day))
    .then((image) => image && request(`terrariums?id=${item.id}&action=card`, { method: 'POST', headers: auth(), body: JSON.stringify({ image }) }))
    .catch(() => {});
  return item;
}

/** Shares of this jar made from this browser, newest last. */
export function sharedFrom(jarId: string): string[] {
  return Object.entries(readJson<Record<string, string>>(SHARED_KEY, {})).filter(([, jar]) => jar === jarId).map(([id]) => id);
}

export async function unshare(id: string) {
  await request(`terrariums?id=${id}`, { method: 'DELETE', headers: auth() });
  const from = readJson<Record<string, string>>(SHARED_KEY, {});
  delete from[id];
  writeJson(SHARED_KEY, from);
}

/** An anonymous id so a visitor's like counts once. Not tied to their username. */
function voter() {
  let v = readJson<string | null>(VOTER_KEY, null);
  if (!v) {
    v = crypto.randomUUID();
    writeJson(VOTER_KEY, v);
  }
  return v;
}

export function hasLiked(id: string) {
  return readJson<string[]>(LIKED_KEY, []).includes(id);
}

export async function like(id: string) {
  const { likes } = await request<{ likes: number }>(`terrariums?id=${id}&action=like`, { method: 'POST', body: JSON.stringify({ voter: voter() }) });
  writeJson(LIKED_KEY, [...new Set([...readJson<string[]>(LIKED_KEY, []), id])]);
  return likes;
}

export function report(id: string) {
  return request<{ hidden: boolean }>(`terrariums?id=${id}&action=report`, { method: 'POST', body: JSON.stringify({ voter: voter() }) });
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
