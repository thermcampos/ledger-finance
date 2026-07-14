import { useEffect, useRef, useState } from 'react';

// Tracks whether a sticky-positioned element is currently "stuck" to the
// top of the viewport, via a zero-height sentinel placed just before it.
// Usage: const { sentinelRef, isStuck } = useStickyHeader();
export function useStickyHeader() {
  const sentinelRef = useRef(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-1px 0px 0px 0px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return { sentinelRef, isStuck };
}
