import { describe, expect, it } from 'vitest';
import { routeOf } from '../src/app/analytics.js';

describe('page views', () => {
  it('group pages by kind, leaving out ids, names and queries', () => {
    expect(routeOf('')).toBe('/');
    expect(routeOf('#/')).toBe('/');
    expect(routeOf('#/jar/k3x9q2')).toBe('/jar/[id]');
    expect(routeOf('#/community')).toBe('/community');
    expect(routeOf('#/community?sort=liked')).toBe('/community');
    expect(routeOf('#/community/abc123')).toBe('/community/[id]');
    expect(routeOf('#/u/fern_keeper')).toBe('/u/[name]');
    expect(routeOf('#/new?draft=1')).toBe('/new');
    expect(routeOf('#/keeper')).toBe('/keeper');
  });
});
