import { useEffect, useRef, useState } from 'react';

/**
 * Shows a long list in steps: the first `step` items, and `step` more each time the end comes
 * into view. A folder with hundreds of files opens as fast as one with a hundred, in list or
 * grid view, without fixed row heights. `resetKey` starts again from the top (another folder).
 */
export function useIncremental<T>(items: T[], resetKey: string, step = 100) {
  const [limit, setLimit] = useState(step);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => setLimit(step), [resetKey, step]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || limit >= items.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((n) => n + step);
      },
      // Start a screen early, so scrolling doesn't reach an empty end.
      { rootMargin: '0px 0px 800px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [limit, items.length, step]);

  return { shown: items.slice(0, limit), more: limit < items.length, sentinel };
}
