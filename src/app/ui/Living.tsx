import { useEffect, useState } from 'react';
import { healthScore, type TerrariumSpec, type TerrariumState } from '../../engine/index.js';
import { grown, hoursSinceShared } from '../../playground/living.js';
import type { Submission } from '../../playground/schema.js';
import { Jar } from '../jar/Jar.js';
import { hasWebGL } from '../jar/Jar3D.js';

/** Run work when the page is idle, one job at a time, so a shelf of jars never stalls scrolling. */
const jobs: (() => void)[] = [];
let busy = false;
function later(fn: () => void) {
  jobs.push(fn);
  if (busy) return;
  busy = true;
  const idle = (cb: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(cb, { timeout: 400 }) : setTimeout(cb, 16));
  const next = () => {
    const job = jobs.shift();
    if (!job) {
      busy = false;
      return;
    }
    job();
    idle(next);
  };
  idle(next);
}

const grownCache = new Map<string, TerrariumState>();
const grownKey = (sub: Submission, now: number) => `${sub.id}:${hoursSinceShared(sub, now)}`;

/** A shared jar as it is today, worked out right away. Use on a page about one jar. */
export function grownNow(sub: Submission, now = Date.now()) {
  const key = grownKey(sub, now);
  let s = grownCache.get(key);
  if (!s) {
    s = grown(sub, now);
    grownCache.set(key, s);
  }
  return s;
}

/** A shared jar as it is today, worked out when the page is idle; the shared snapshot until then. */
export function useGrown(sub: Submission): TerrariumState {
  const [state, setState] = useState(() => grownCache.get(grownKey(sub, Date.now())) ?? sub.state);
  useEffect(() => {
    let live = true;
    later(() => {
      const s = grownNow(sub);
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, [sub]);
  return state;
}

export const dayOfState = (s: TerrariumState) => Math.floor(s.hour / 24);
export const scoreOf = (s: TerrariumState) => healthScore(s);

const stillCache = new Map<string, string | null>();
/** Off until the offscreen stills stop coming out blank (transparent glass over a transparent background). */
const STILLS_ENABLED = false;

/** A rendered 3D still of the jar, with the drawing standing in until it is ready (or without WebGL). */
export function JarStill({ k, spec, state, title }: { k: string; spec: TerrariumSpec; state: TerrariumState; title: string }) {
  const [src, setSrc] = useState(() => stillCache.get(k) ?? null);
  useEffect(() => {
    if (stillCache.has(k)) {
      setSrc(stillCache.get(k) ?? null);
      return;
    }
    if (!STILLS_ENABLED || !hasWebGL()) return;
    let live = true;
    import('../three/stills.js')
      .then((m) => m.renderStill(k, spec, state))
      .then((url) => {
        stillCache.set(k, url);
        if (live) setSrc(url);
      })
      .catch(() => stillCache.set(k, null));
    return () => {
      live = false;
    };
  }, [k, spec, state]);
  if (src) return <img className="jar-still" src={src} alt={title} draggable={false} />;
  return <Jar spec={spec} state={state} lively title={title} />;
}
