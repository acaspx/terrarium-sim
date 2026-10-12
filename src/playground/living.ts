/**
 * Shared jars keep living. A share is a snapshot of a jar on the day it was
 * shared; from then on it grows by itself, an hour of simulation per real hour,
 * with nobody to mist it or air it out. The engine is deterministic, so every
 * visitor who opens it on the same day sees the same jar.
 */
import { expandFrame, frameDue, run, step, toFrame, type Frame, type TerrariumState } from '../engine/index.js';
import type { Submission } from './schema.js';

/** Past this, a shared jar stops ageing: two years left alone is a story already told. */
export const MAX_GROW_DAYS = 730;

export function hoursSinceShared(sub: Pick<Submission, 'createdAt'>, now: number) {
  return Math.max(0, Math.min(MAX_GROW_DAYS * 24, Math.floor((now - sub.createdAt) / 3.6e6)));
}

/** The shared jar as it is now. */
export function grown(sub: Pick<Submission, 'state' | 'createdAt'>, now: number): TerrariumState {
  const s = structuredClone(sub.state);
  run(s, hoursSinceShared(sub, now));
  return s;
}

export interface Moment {
  state: TerrariumState;
  day: number;
  /** recorded: from the keeper's own jar before sharing; shared: the day it was shared; grown: on its own since. */
  kind: 'recorded' | 'shared' | 'grown';
}

/** Most moments in a time-lapse; longer lives are sampled evenly. */
const MAX_MOMENTS = 60;

/** The jar's life as a run of moments: its recorded past, the day it was shared, and every week since. */
export function lifeOf(sub: Pick<Submission, 'spec' | 'state' | 'createdAt' | 'frames'>, now: number): Moment[] {
  const sharedHour = sub.state.hour;
  const recorded: Moment[] = (sub.frames ?? [])
    .filter((f) => f.hour < sharedHour)
    .map((f) => ({ state: expandFrame(sub.spec, f), day: Math.floor(f.hour / 24), kind: 'recorded' }));
  const moments: Moment[] = [...recorded, { state: sub.state, day: Math.floor(sharedHour / 24), kind: 'shared' }];
  const s = structuredClone(sub.state);
  const end = sharedHour + hoursSinceShared(sub, now);
  while (s.hour < end) {
    step(s);
    if (frameDue(s) || s.hour === end) moments.push({ state: structuredClone({ ...s, events: [] }), day: Math.floor(s.hour / 24), kind: 'grown' });
  }
  if (moments.length <= MAX_MOMENTS) return moments;
  // Sample evenly, always keeping the first, the day it was shared and today.
  const keep = new Set([0, recorded.length, moments.length - 1]);
  for (let i = 0; i < MAX_MOMENTS - keep.size; i++) keep.add(Math.round((i * (moments.length - 1)) / (MAX_MOMENTS - keep.size)));
  return moments.filter((_, i) => keep.has(i));
}

/** Frames of a local jar's own life, for its time-lapse (no growing ahead: it is still being looked after). */
export function framesToMoments(spec: Submission['spec'], frames: Frame[], now: TerrariumState): Moment[] {
  const past = frames.filter((f) => f.hour < now.hour).map((f) => ({ state: expandFrame(spec, f), day: Math.floor(f.hour / 24), kind: 'recorded' as const }));
  return [...past, { state: now, day: Math.floor(now.hour / 24), kind: 'recorded' }];
}

export { toFrame };
