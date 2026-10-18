import { useEffect, useSyncExternalStore } from 'react';
import { Builder } from './screens/Builder.js';
import { Detail } from './screens/Detail.js';
import { KeeperPage, KeeperShelf, Playground, SharedJar } from './screens/Playground.js';
import { useIdentity } from './playground.js';
import { Shelf } from './screens/Shelf.js';
import { startClock } from './store.js';
import { PageBoundary } from './ui/PageBoundary.js';
import { TimeControl } from './ui/TimeControl.js';
import { Inbox } from './ui/Inbox.js';
import { SoundToggle } from './ui/SoundToggle.js';
import { startNotifier } from './notify.js';

const subscribeHash = (fn: () => void) => {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
};
/** A malformed address (a stray %) must not crash the app shell, which sits above the page safety net. */
const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
const useRoute = () => useSyncExternalStore(subscribeHash, () => location.hash.replace(/^#/, '') || '/');

export function App() {
  const route = useRoute();
  const me = useIdentity();
  useEffect(() => startClock(), []);
  useEffect(() => startNotifier(), []);
  // Pinned panels sit just below the sticky top bar, whose height changes as it wraps on narrow screens.
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('.topbar');
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--topbar-h', `${bar.offsetHeight}px`));
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  // Block body: newer browsers return a promise from scrollTo, and an effect may only return a cleanup function.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.split('?')[0]]);

  const path = route.split('?')[0]!;
  const ownShelf = !!me && path === `/u/${me.name}`;
  let screen;
  if (path.startsWith('/jar/')) screen = <Detail key={path} id={path.slice(5)} />;
  // #/playground links from before the community shelf still work.
  else if (/^\/(community|playground)\/./.test(path)) screen = <SharedJar key={path} id={path.slice(path.indexOf('/', 1) + 1)} />;
  else if (path === '/community' || path === '/playground') screen = <Playground />;
  else if (path.startsWith('/u/')) screen = <KeeperShelf key={path} name={safeDecode(path.slice(3)).toLowerCase()} />;
  else if (path === '/keeper') screen = <KeeperPage />;
  else if (path === '/new') screen = <Builder key={route} />;
  else screen = <Shelf />;

  return (
    <>
      <header className="topbar">
        <div className="topnav">
          <a href="#/" className="wordmark">Terrarium</a>
          <nav aria-label="Main">
            <a href="#/" aria-current={path === '/' || path.startsWith('/jar/') ? 'page' : undefined}>Shelf</a>
            <a href="#/community" aria-current={/^\/(community|playground|u\/)/.test(path) && !ownShelf ? 'page' : undefined}>Community</a>
            <a href={me ? `#/u/${me.name}` : '#/keeper'} className="nav-keeper" aria-current={path === '/keeper' || ownShelf ? 'page' : undefined}>
              {me ? `@${me.name}` : 'Join'}
            </a>
          </nav>
        </div>
        <div className="topbar-tools">
          <SoundToggle />
          <Inbox />
          <TimeControl />
        </div>
      </header>
      <PageBoundary key={path}>{screen}</PageBoundary>
    </>
  );
}
