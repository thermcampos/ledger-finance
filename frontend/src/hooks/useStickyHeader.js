import { useEffect, useRef, useState } from 'react';

// Distance, in px, over which the header transitions from flat to stuck.
const SCROLL_RANGE = 48;

// Tracks scroll progress (0-1) of a sticky-positioned element becoming
// "stuck" to the top of the viewport, via a zero-height sentinel placed
// just before it. `progress` climbs smoothly over SCROLL_RANGE px so
// callers can drive continuous styles (e.g. --header-scale) instead of
// snapping at a single breakpoint.
// Usage: const { sentinelRef, progress, isStuck } = useStickyHeader();
export function useStickyHeader() {
  const sentinelRef = useRef(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;

    let frame = null;
    const measure = () => {
      frame = null;
      const distance = -sentinel.getBoundingClientRect().top;
      const clamped = Math.min(Math.max(distance, 0), SCROLL_RANGE);
      setProgress(clamped / SCROLL_RANGE);
    };
    const onScroll = () => {
      if (frame === null) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return { sentinelRef, progress, isStuck: progress > 0 };
}
