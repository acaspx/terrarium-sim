import { useEffect, useSyncExternalStore } from 'react';
import { Builder } from './screens/Builder.js';
import { Detail } from './screens/Detail.js';
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
  useEffect(() => startClock(), []);
  useEffect(() => window.scrollTo(0, 0), [route.split('?')[0]]);

  const path = route.split('?')[0]!;
  let screen;
  if (path.startsWith('/jar/')) screen = <Detail id={path.slice(5)} />;
  else if (path === '/new') screen = <Builder key={route} />;
  else screen = <Shelf />;

  return (
    <>
      <header className="topbar">
        <a href="#/" className="wordmark">Terrarium</a>
        <TimeControl />
      </header>
      {screen}
    </>
  );
}
