import { useEffect, useLayoutEffect, useRef } from 'react';

// Android back gesture: whatever opened last (a sheet, a folder, a sub-view) handles it first.
// The app's own fallback (go to Home, then leave) runs only when nothing is registered.

type Handler = { run: () => void };
const stack: Handler[] = [];

/** Runs the newest registered handler. Returns false if there was none. */
export function handleBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.run();
  return true;
}

function register(entry: Handler) {
  stack.push(entry);
  return () => {
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** While `active`, the back gesture calls `onBack` instead of the default. */
export function useBackHandler(active: boolean, onBack: () => void) {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!active) return;
    return register({ run: () => latest.current() });
  }, [active]);
}

/**
 * For containers such as sheets: registers before the content inside them (layout effects
 * run before passive ones), so a wizard inside a sheet still gets "back" first.
 */
export function useContainerBackHandler(active: boolean, onBack: () => void) {
  const latest = useRef(onBack);
  latest.current = onBack;
  useLayoutEffect(() => {
    if (!active) return;
    return register({ run: () => latest.current() });
  }, [active]);
}
