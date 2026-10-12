import { useEffect, useRef, useState } from 'react';

/** What the 3D view frames: matches the camera shots in three/camera.tsx. */
export type Focus = 'all' | 'layers' | 'plants' | 'crew' | 'light';

/** What the label on the view says for each shot. */
export const FOCUS_LABEL: Record<Focus, string> = {
  all: 'The whole jar',
  layers: 'Layers: drainage and substrate',
  plants: 'Plants, from above',
  crew: 'Animals, up close',
  light: 'Placement and light',
};

/**
 * Follows which part of a long page is being read, so the 3D view beside it can frame
 * the matching part of the jar. Sections opt in with a data-focus attribute; the one
 * crossing a thin band across the screen wins. On a phone the view is pinned to the
 * top, so the band sits lower, below it. setFocus lets a section claim the view when
 * it is touched, without waiting for a scroll. Pass ready = false while the sections
 * have not rendered yet (content still loading); watching starts when it turns true.
 */
export function useSectionFocus(ready = true) {
  const ref = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<Focus>('all');
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const narrow = matchMedia('(max-width: 860px)').matches;
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const f = (hit?.target as HTMLElement | undefined)?.dataset.focus as Focus | undefined;
        if (f) setFocus(f);
      },
      { rootMargin: narrow ? '-58% 0px -38% 0px' : '-28% 0px -66% 0px' },
    );
    root.querySelectorAll('[data-focus]').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [ready]);
  /** On a container: touching anything inside a section points the view at that section. */
  const claim = (e: { target: EventTarget }) => {
    const f = (e.target as HTMLElement).closest<HTMLElement>('[data-focus]')?.dataset.focus as Focus | undefined;
    if (f) setFocus(f);
  };
  return { ref, focus, setFocus, claim };
}
