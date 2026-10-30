#!/usr/bin/env node
// Lists translation keys that nothing uses. Missing translations are caught by TypeScript
// (en must have every key of es), so this only looks for leftovers.
//
//   node scripts/check-i18n.mjs        exits with 1 if there are unused keys (used in CI)

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../src/', import.meta.url).pathname;
const i18n = readFileSync(join(root, 'i18n.ts'), 'utf8');
const esBlock = i18n.slice(i18n.indexOf('const es = {'), i18n.indexOf('export type MessageKey'));
const keys = [...esBlock.matchAll(/^\s+'([\w.]+)':/gm)].map((m) => m[1]);

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts') && f !== 'i18n.ts' ? [p] : [];
  });
}
const code = files(root)
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

// Keys built at run time, like t(`state.${status.state}`): the prefix counts as using them.
const prefixes = [...code.matchAll(/`([\w.]+\.)\$\{/g)].map((m) => m[1]);

const unused = keys.filter(
  (k) => !code.includes(`'${k}'`) && !prefixes.some((p) => k.startsWith(p)),
);
if (unused.length) {
  console.error(`Unused translation keys (${unused.length}):\n  ${unused.join('\n  ')}`);
  process.exit(1);
}
console.log(`i18n: ${keys.length} keys, all used.`);
