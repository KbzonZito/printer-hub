import { lazy, type ComponentType } from 'react';

/**
 * React.lazy for a named export: the module is downloaded the first time the component
 * renders, so the app starts with less code to parse.
 */
export function lazyNamed<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(async () => ({
    default: (await load())[name] as ComponentType<any>,
  })) as unknown as M[K];
}
