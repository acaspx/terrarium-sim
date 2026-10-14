import type { SimEvent } from '../engine/index.js';
import { onNews, type JarRecord } from './store.js';

/**
 * Browser notifications, opt-in, for news from your jars while the site is open in a
 * background tab. Your jars live in this browser, so nothing can notify you while the
 * site is closed; the inbox catches you up when you come back.
 */

const PREF = 'terrarium-sim:notify';
/** Real time between notifications about the same jar: fast-forward can produce a lot of news. */
const PER_JAR_MS = 60_000;

export type NotifyState = 'unsupported' | 'denied' | 'off' | 'on';

const supported = () => typeof window !== 'undefined' && 'Notification' in window;

export function notifyState(): NotifyState {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  let on = false;
  try {
    on = localStorage.getItem(PREF) === 'on';
  } catch {
    on = false;
  }
  return on && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Turn notifications on or off. Turning on asks the browser for permission (needs a click). */
export async function setNotify(on: boolean): Promise<NotifyState> {
  if (!supported()) return 'unsupported';
  if (on && Notification.permission !== 'granted') {
    const answer = await Notification.requestPermission();
    if (answer !== 'granted') return answer === 'denied' ? 'denied' : 'off';
  }
  try {
    localStorage.setItem(PREF, on ? 'on' : 'off');
  } catch {
    // Without storage the choice lasts for this visit only.
  }
  return notifyState();
}

const lastSent = new Map<string, number>();
const pending = new Map<string, { j: JarRecord; events: SimEvent[] }>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function send(j: JarRecord, events: SimEvent[]) {
  const body = events.length === 1 ? events[0]!.message : `${events[0]!.message} And ${events.length - 1} more.`;
  try {
    const n = new Notification(j.spec.name, { body, tag: `jar-${j.id}`, icon: undefined });
    n.onclick = () => {
      window.focus();
      location.hash = `#/jar/${j.id}`;
      n.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker; the inbox still has it.
  }
  lastSent.set(j.id, Date.now());
}

function flush() {
  flushTimer = null;
  for (const [id, { j, events }] of pending) {
    if (Date.now() - (lastSent.get(id) ?? 0) < PER_JAR_MS) continue;
    send(j, events);
    pending.delete(id);
  }
  if (pending.size) flushTimer = setTimeout(flush, 5_000);
}

/** Start listening for jar news; returns a stop function. */
export function startNotifier() {
  return onNews((j, events) => {
    // Only when the site is in the background: in front, the inbox and the page show it.
    if (notifyState() !== 'on' || document.visibilityState !== 'hidden') return;
    const queued = pending.get(j.id);
    pending.set(j.id, { j, events: [...(queued?.events ?? []), ...events].slice(-10) });
    if (!flushTimer) flushTimer = setTimeout(flush, 1_000);
  });
}
