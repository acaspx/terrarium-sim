import { useEffect, useRef, useState } from 'react';
import { Bell, Bug, Check, Leaf, Sparkles, TriangleAlert } from 'lucide-react';
import { notifyState, setNotify, type NotifyState } from '../notify.js';
import { store, unseenEvents, useStore } from '../store.js';

const ICON: Record<string, typeof Bell> = {
  alert: TriangleAlert, 'plant-death': Leaf, mushrooms: Sparkles, invasion: Bug, extinction: Bug, recovery: Check,
};

/**
 * The inbox: what has happened in your jars since you last looked at each one, newest
 * first. Opening a jar marks its news as seen; "Mark all as seen" clears the lot.
 * Also where browser notifications are switched on.
 */
export function Inbox() {
  useStore();
  const [open, setOpen] = useState(false);
  const [notify, setNotifyState] = useState<NotifyState>(notifyState);
  const box = useRef<HTMLDivElement>(null);

  const items = store.jars
    .flatMap((j) => unseenEvents(j).map((e) => ({ j, e })))
    .sort((a, b) => b.e.hour - a.e.hour || (a.j.spec.name < b.j.spec.name ? -1 : 1))
    .slice(0, 30);
  const count = store.jars.reduce((n, j) => n + unseenEvents(j).length, 0);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  // Close when a link inside takes you to a jar.
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener('hashchange', close);
    return () => window.removeEventListener('hashchange', close);
  }, []);

  const toggleNotify = async () => setNotifyState(await setNotify(notify !== 'on'));

  return (
    <div className="inbox" ref={box}>
      <button type="button" className="icon-button inbox-button" aria-expanded={open} aria-controls="inbox-panel"
        aria-label={count ? `${count} new ${count === 1 ? 'note' : 'notes'} from your jars` : 'News from your jars'} onClick={() => setOpen((o) => !o)}>
        <Bell size={17} aria-hidden="true" />
        {count > 0 && <span className="inbox-count" aria-hidden="true">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <div className="inbox-panel" id="inbox-panel" role="region" aria-label="News from your jars">
          <div className="inbox-head">
            <strong>Since you last looked</strong>
            {count > 0 && <button type="button" className="button quiet" onClick={() => store.markAllSeen()}>Mark all as seen</button>}
          </div>
          {items.length === 0 ? (
            <p className="hint inbox-empty">Nothing new. News from your jars collects here: mushrooms, wilting plants, mold, pests.</p>
          ) : (
            <ul className="inbox-list">
              {items.map(({ j, e }, i) => {
                const Icon = ICON[e.type] ?? Bell;
                return (
                  <li key={`${j.id}-${e.hour}-${i}`}>
                    <a href={`#/jar/${j.id}`} className={`inbox-item kind-${e.type}`}>
                      <Icon size={15} aria-hidden="true" />
                      <span>
                        <span className="inbox-jar">{j.spec.name}, day {Math.floor(e.hour / 24)}</span>
                        <span className="inbox-msg">{e.message}</span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="inbox-foot">
            {notify === 'unsupported' ? (
              <span className="hint">This browser cannot show notifications.</span>
            ) : notify === 'denied' ? (
              <span className="hint">Notifications are blocked for this site in your browser settings.</span>
            ) : (
              <label className="saved-check">
                <input type="checkbox" checked={notify === 'on'} onChange={toggleNotify} />
                Notify me while this site is open in another tab
              </label>
            )}
            <span className="hint">Your jars live in this browser, so nothing can reach you while the site is closed. This inbox catches you up.</span>
          </div>
        </div>
      )}
    </div>
  );
}
