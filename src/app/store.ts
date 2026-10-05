import { useSyncExternalStore } from 'react';
import {
  alerts, buildTerrarium, care, geometry, healthScore, RECIPES, step,
  type TerrariumSpec, type TerrariumState,
} from '../engine/index.js';

/** How fast simulated time runs. "live" is real time: one simulated hour per real hour. */
export type Speed = 'paused' | 'live' | 'day' | 'week';
export const HOURS_PER_SECOND: Record<Speed, number> = { paused: 0, live: 1 / 3600, day: 24, week: 168 };

export interface DayPoint {
  d: number;
  score: number;
  moist: number;
  rh: number;
  temp: number;
  mold: number;
  plantG: number;
  pop: Record<string, number>;
}

export interface JarRecord {
  id: string;
  spec: TerrariumSpec;
  state: TerrariumState;
  history: DayPoint[];
  createdAt: number;
  /** Fractional simulated hours waiting to be stepped. */
  pending: number;
  alertCodes: string[];
  /** Simulated hour the keeper last looked at this jar; events after it are "new". */
  seenHour: number;
}

interface Persisted {
  version: 1;
  speed: Speed;
  lastRealMs: number;
  jars: JarRecord[];
}

const KEY = 'terrarium-sim:v1';
const MAX_EVENTS = 300;
const MAX_HISTORY = 730;
/** Never catch up more than this in one go (two years). */
const MAX_CATCH_UP_H = 24 * 365 * 2;
/** Steps per jar per frame, so a long catch-up does not freeze the page. */
const MAX_STEPS_PER_FRAME = 24 * 14;

const ALERT_CLEARED: Record<string, string> = {
  'mold-bloom': 'The mold bloom has cleared.',
  waterlogged: 'The substrate has drained.',
  'too-dry': 'Moisture is back in range.',
  overheating: 'The temperature is back to normal.',
};

const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

function dayPoint(s: TerrariumState): DayPoint {
  const pop: Record<string, number> = {};
  for (const f of s.fauna) pop[f.speciesId] = Math.round(f.juveniles + f.adults);
  return {
    d: Math.floor(s.hour / 24),
    score: healthScore(s),
    moist: +s.climate.moisture.toFixed(3),
    rh: +s.climate.rh.toFixed(3),
    temp: +s.climate.airTempC.toFixed(1),
    mold: +s.pools.moldG.toFixed(4),
    plantG: +s.plants.reduce((a, p) => a + p.biomassG, 0).toFixed(2),
    pop,
  };
}

/** One simulated hour, plus the bookkeeping the interface needs (daily history, alert changes). */
function stepJar(j: JarRecord): void {
  const s = j.state;
  step(s);
  if (s.hour % 24 !== 0) return;
  j.history.push(dayPoint(s));
  if (j.history.length > MAX_HISTORY) j.history.splice(0, j.history.length - MAX_HISTORY);
  const now = alerts(s);
  const codes = now.map((a) => a.code);
  for (const a of now) {
    if (!j.alertCodes.includes(a.code) && a.severity !== 'info') s.events.push({ hour: s.hour, type: 'alert', message: a.message });
  }
  for (const c of j.alertCodes) {
    if (!codes.includes(c) && ALERT_CLEARED[c]) s.events.push({ hour: s.hour, type: 'recovery', message: ALERT_CLEARED[c] });
  }
  j.alertCodes = codes;
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
}

function newRecord(spec: TerrariumSpec): JarRecord {
  const state = buildTerrarium(spec);
  return {
    id: uid(), spec: structuredClone(spec), state, history: [dayPoint(state)],
    createdAt: Date.now(), pending: 0, alertCodes: [], seenHour: 0,
  };
}

class Store {
  speed: Speed = 'live';
  lastRealMs = Date.now();
  jars: JarRecord[] = [];
  version = 0;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit() {
    this.version++;
    for (const fn of this.listeners) fn();
    if (!this.saveTimer) this.saveTimer = setTimeout(() => this.save(), 1500);
  }

  private load() {
    let data: Persisted | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) data = JSON.parse(raw) as Persisted;
    } catch {
      data = null;
    }
    if (data?.version === 1) {
      this.speed = data.speed;
      this.jars = data.jars;
      // Time kept passing while the page was closed.
      if (this.speed === 'live') {
        const away = (Date.now() - data.lastRealMs) / 3.6e6;
        for (const j of this.jars) j.pending += Math.min(away, MAX_CATCH_UP_H);
      }
    } else {
      this.seedExample();
    }
    this.lastRealMs = Date.now();
  }

  /** A first visit gets one established jar, so the shelf shows what a living terrarium looks like. */
  private seedExample() {
    const recipe = RECIPES[0]!;
    const j = newRecord({ ...recipe.spec, name: 'Tropical jar', seed: 7 });
    // Forty days and a few hours, so a first visit lands in the afternoon with the lights on.
    for (let i = 0; i < 24 * 40 + 14; i++) stepJar(j);
    j.seenHour = j.state.hour;
    j.createdAt = Date.now() - 40 * 864e5;
    this.jars = [j];
  }

  save = () => {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const data: Persisted = { version: 1, speed: this.speed, lastRealMs: Date.now(), jars: this.jars };
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // Storage full or unavailable: the session keeps running in memory.
    }
  };

  /** Advance every jar by the simulated time that corresponds to `dtMs` of real time. */
  tick(dtMs: number) {
    // Fast-forward should not leap ahead after the tab was in the background.
    if (this.speed !== 'live') dtMs = Math.min(dtMs, 250);
    const hours = HOURS_PER_SECOND[this.speed] * (dtMs / 1000);
    let changed = false;
    for (const j of this.jars) {
      j.pending += hours;
      let n = 0;
      while (j.pending >= 1 && n < MAX_STEPS_PER_FRAME) {
        stepJar(j);
        j.pending -= 1;
        n++;
      }
      if (n > 0) changed = true;
    }
    this.lastRealMs = Date.now();
    if (changed) this.emit();
  }

  setSpeed(speed: Speed) {
    this.speed = speed;
    this.emit();
  }

  get(id: string) {
    return this.jars.find((j) => j.id === id);
  }

  create(spec: TerrariumSpec): string {
    const j = newRecord(spec);
    this.jars.push(j);
    this.emit();
    this.save();
    return j.id;
  }

  remove(id: string) {
    this.jars = this.jars.filter((j) => j.id !== id);
    this.emit();
    this.save();
  }

  rename(id: string, name: string) {
    const j = this.get(id);
    if (!j) return;
    j.spec.name = name.trim() || j.spec.name;
    this.emit();
  }

  markSeen(id: string) {
    const j = this.get(id);
    if (!j || j.seenHour === j.state.hour) return;
    j.seenHour = j.state.hour;
    this.emit();
  }

  markAllSeen() {
    for (const j of this.jars) j.seenHour = j.state.hour;
    this.emit();
  }

  /** Apply a keeper action from engine/care to one jar. */
  act(id: string, fn: (s: TerrariumState) => void) {
    const j = this.get(id);
    if (!j) return;
    fn(j.state);
    // Show the effect right away rather than at the next simulated hour.
    const s = j.state;
    s.climate = { ...s.climate, moisture: s.pools.substrateWaterG / geometry(s.container).fieldCapacityG };
    this.emit();
  }
}

export const store = new Store();
export { care };

export function useStore() {
  useSyncExternalStore(store.subscribe, () => store.version);
  return store;
}

/** Events the keeper has not seen yet, excluding their own care actions. */
export function unseenEvents(j: JarRecord) {
  return j.state.events.filter((e) => e.hour > j.seenHour && e.type !== 'care');
}

export function startClock() {
  let last = performance.now();
  let raf = 0;
  const loop = (t: number) => {
    store.tick(t - last);
    last = t;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  const onHide = () => {
    if (document.visibilityState === 'hidden') store.save();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', store.save);
  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', store.save);
  };
}
