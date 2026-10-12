import { useEffect, useSyncExternalStore } from 'react';
import { Builder } from './screens/Builder.js';
import { Detail } from './screens/Detail.js';
import { KeeperPage, KeeperShelf, Playground, SharedJar } from './screens/Playground.js';
import { useIdentity } from './playground.js';
import { Shelf } from './screens/Shelf.js';
import { startClock } from './store.js';
import { TimeControl } from './ui/TimeControl.js';

const subscribeHash = (fn: () => void) => {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
};
const useRoute = () => useSyncExternalStore(subscribeHash, () => location.hash.replace(/^#/, '') || '/');

export function App() {
  const route = useRoute();
  const me = useIdentity();
  useEffect(() => startClock(), []);
  useEffect(() => window.scrollTo(0, 0), [route.split('?')[0]]);

  const path = route.split('?')[0]!;
  const ownShelf = !!me && path === `/u/${me.name}`;
  let screen;
  if (path.startsWith('/jar/')) screen = <Detail key={path} id={path.slice(5)} />;
  // #/playground links from before the community shelf still work.
  else if (/^\/(community|playground)\/./.test(path)) screen = <SharedJar key={path} id={path.slice(path.indexOf('/', 1) + 1)} />;
  else if (path === '/community' || path === '/playground') screen = <Playground />;
  else if (path.startsWith('/u/')) screen = <KeeperShelf key={path} name={decodeURIComponent(path.slice(3)).toLowerCase()} />;
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
        <TimeControl />
      </header>
      {screen}
    </>
  );
}
