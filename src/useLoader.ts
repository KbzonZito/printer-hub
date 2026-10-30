import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads something when `deps` change and keeps the data and the error. `reload()` returns a
 * promise (for pull to refresh); a newer load wins over a slower older one.
 */
export function useLoader<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(load);
  latest.current = load;
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const gen = ++generation.current;
    try {
      const value = await latest.current();
      if (gen !== generation.current) return;
      setData(value);
      setError(null);
    } catch (e) {
      if (gen === generation.current) setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    setData(null);
    setError(null);
    reload();
  }, deps);

  return { data, error, loading: data == null && error == null, reload, setData };
}
