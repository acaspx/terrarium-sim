import { inject, pageview } from '@vercel/analytics';

/**
 * Page views for Vercel Web Analytics: cookieless, no personal data. The app's pages live
 * after a # (which the automatic tracking does not follow), so views are reported here on
 * every route change, grouped by kind of page: ids and names are left out, so a jar page
 * counts as a jar page, not as somebody's particular jar.
 */
export function routeOf(hash: string): string {
  const [first = '', second] = hash.replace(/^#\/?/, '').split('?')[0]!.split('/');
  if (!first) return '/';
  if (first === 'jar') return '/jar/[id]';
  if (first === 'u') return '/u/[name]';
  if (first === 'community') return second ? '/community/[id]' : '/community';
  return `/${first}`;
}

export function startAnalytics() {
  inject({ disableAutoTrack: true });
  let last = '';
  const send = () => {
    const route = routeOf(location.hash);
    // Query changes (sorting the shelf, a draft) are the same page.
    if (route === last) return;
    last = route;
    pageview({ route, path: route });
  };
  send();
  window.addEventListener('hashchange', send);
}
