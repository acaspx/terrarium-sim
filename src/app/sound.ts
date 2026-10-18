import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Quiet sound for the jars, made in the browser with the Web Audio API (no audio files):
 * a hush of humid air while a jar is on screen, drips as often as the glass is wet
 * enough to drip, and small sounds for touching the glass, the soil, the leaves, and
 * for a crab running off. Off until the visitor turns it on; the choice is remembered.
 */

const PREF = 'terrarium-sim:sound';
export type Cue = 'glass' | 'soil' | 'leaf' | 'scuttle';

/**
 * Drips a second from the simulation's condensation index. None on clear glass (under
 * 0.08, "clear" in the interface). A settled sealed jar sits at a light mist, about 0.1
 * to 0.2, and drips about once a minute as beads merge and run; fogged and streaming
 * glass drips more often, up to about one every three seconds.
 */
export function dripsPerSecond(condensation: number): number {
  if (condensation < 0.08) return 0;
  return Math.min(0.4, 0.01 + 0.3 * Math.pow(condensation - 0.08, 1.3));
}

// ------------------------------------------------------------------ on / off

let on = (() => {
  try {
    return localStorage.getItem(PREF) === 'on';
  } catch {
    return false;
  }
})();
const listeners = new Set<() => void>();

export function useSoundOn(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => on,
  );
}

/** Call from a click: browsers only start audio after the visitor has done something. */
export function setSoundOn(next: boolean) {
  on = next;
  try {
    localStorage.setItem(PREF, next ? 'on' : 'off');
  } catch {
    // Without storage the choice lasts for this visit.
  }
  for (const fn of listeners) fn();
  if (next) engine()?.resume();
  update();
}

// ------------------------------------------------------------------ engine

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  room: GainNode;
  /** A short, dark echo, as from inside a glass jar. */
  jar: AudioNode;
  noise: AudioBuffer;
  resume: () => void;
}
let eng: Engine | null = null;

function engine(): Engine | null {
  if (eng) return eng;
  const AC = typeof window !== 'undefined' ? window.AudioContext : undefined;
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  // Brown noise: soft, low, like still air. Two seconds, looped.
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  const hush = ctx.createBufferSource();
  hush.buffer = noise;
  hush.loop = true;
  const dark = ctx.createBiquadFilter();
  dark.type = 'lowpass';
  dark.frequency.value = 380;
  const room = ctx.createGain();
  room.gain.value = 0;
  hush.connect(dark).connect(room).connect(master);
  hush.start();

  const delay = ctx.createDelay(0.1);
  delay.delayTime.value = 0.023;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.28;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 3200;
  const jar = ctx.createGain();
  jar.connect(master);
  jar.connect(delay).connect(tone).connect(feedback).connect(delay);
  tone.connect(master);

  eng = { ctx, master, room, jar, noise, resume: () => void ctx.resume() };
  return eng;
}

/** A burst of the noise, filtered: the raw material for taps, rustles and clicks. */
function burst(e: Engine, at: number, type: BiquadFilterType, freq: number, length: number, peak: number, pan: number) {
  const src = e.ctx.createBufferSource();
  src.buffer = e.noise;
  const f = e.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = e.ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + Math.min(0.01, length / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  const p = e.ctx.createStereoPanner();
  p.pan.value = pan;
  src.connect(f).connect(g).connect(p).connect(e.jar);
  src.start(at, Math.random() * 1.5);
  src.stop(at + length + 0.05);
}

/** A ringing note that falls in pitch and dies away: a drip, or glass struck lightly. */
function ping(e: Engine, at: number, from: number, to: number, length: number, peak: number, pan: number) {
  const o = e.ctx.createOscillator();
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(to, at + length * 0.6);
  const g = e.ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  const p = e.ctx.createStereoPanner();
  p.pan.value = pan;
  o.connect(g).connect(p).connect(e.jar);
  o.start(at);
  o.stop(at + length + 0.05);
}

function drip(e: Engine) {
  const at = e.ctx.currentTime + 0.01;
  const pitch = 1300 + Math.random() * 1300;
  const pan = Math.random() * 1.2 - 0.6;
  ping(e, at, pitch, pitch * 0.55, 0.14, 0.05 + Math.random() * 0.04, pan);
  // Now and then the drop lands with a second, lower plip.
  if (Math.random() < 0.3) ping(e, at + 0.05, pitch * 0.7, pitch * 0.45, 0.1, 0.025, pan);
}

let lastGlass = 0;

/** A small sound for something the visitor did. Silent while sound is off. */
export function cue(kind: Cue, pan = 0) {
  if (!on) return;
  const e = engine();
  if (!e || e.ctx.state !== 'running') return;
  const at = e.ctx.currentTime + 0.005;
  // A tap on the glass reaches the soil behind it too; it should sound like glass alone.
  if (kind === 'glass') lastGlass = at;
  else if (kind === 'soil' && at - lastGlass < 0.1) return;
  if (kind === 'glass') {
    ping(e, at, 2500, 2350, 0.22, 0.05, pan);
    ping(e, at, 3900, 3700, 0.12, 0.02, pan);
  } else if (kind === 'soil') {
    burst(e, at, 'lowpass', 320, 0.09, 0.14, pan);
  } else if (kind === 'leaf') {
    burst(e, at, 'bandpass', 4200, 0.18, 0.05, pan);
  } else {
    // A crab's feet on the soil: a quick patter of tiny clicks.
    for (let i = 0; i < 6; i++) burst(e, at + i * 0.045 + Math.random() * 0.02, 'bandpass', 3800 + Math.random() * 1500, 0.012, 0.05, pan);
  }
}

// ------------------------------------------------------------------ ambience

/** Jar views on screen now, each with how wet its glass is and whether its light is on. */
const views = new Map<symbol, { condensation: number; lightOn: boolean }>();
let dripTimer: ReturnType<typeof setTimeout> | null = null;

function update() {
  const e = eng;
  if (!e) return;
  const now = e.ctx.currentTime;
  const audible = on && views.size > 0 && document.visibilityState === 'visible';
  e.master.gain.setTargetAtTime(audible ? 1 : 0, now, 0.4);
  const night = [...views.values()].every((v) => !v.lightOn);
  e.room.gain.setTargetAtTime(audible ? (night ? 0.022 : 0.032) : 0, now, 0.8);
  if (audible && !dripTimer) scheduleDrip();
}

function scheduleDrip() {
  const rate = Math.max(0, ...[...views.values()].map((v) => dripsPerSecond(v.condensation)));
  // When nothing drips, look again in a few seconds: the glass may have fogged up.
  const wait = rate > 0 ? -Math.log(1 - Math.random()) / rate : 4;
  dripTimer = setTimeout(() => {
    dripTimer = null;
    const e = eng;
    if (!e || !on || views.size === 0 || document.visibilityState !== 'visible') return;
    if (rate > 0 && e.ctx.state === 'running') drip(e);
    scheduleDrip();
  }, Math.min(wait, 12) * 1000);
}

if (typeof document !== 'undefined') {
  // In a background tab, fade out and let the audio hardware sleep.
  document.addEventListener('visibilitychange', () => {
    if (!eng) return;
    if (document.visibilityState === 'visible' && on) eng.resume();
    update();
    if (document.visibilityState === 'hidden') setTimeout(() => document.visibilityState === 'hidden' && void eng?.ctx.suspend(), 600);
  });
}

/** While a live jar view is on screen: the hush of its air and the drip of its glass. */
export function useAmbience(condensation: number, lightOn: boolean, active: boolean) {
  const id = useRef(Symbol('jar')).current;
  useEffect(() => {
    if (!active) return;
    views.set(id, { condensation, lightOn });
    update();
    return () => {
      views.delete(id);
      update();
    };
    // Added and removed with the view; its values are kept fresh by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, id]);
  useEffect(() => {
    const v = views.get(id);
    if (!v) return;
    v.condensation = condensation;
    v.lightOn = lightOn;
    update();
  }, [id, condensation, lightOn]);
}
