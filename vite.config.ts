/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import pkg from './package.json' with { type: 'json' };

// Test builds (scripts/build-apk.sh) add "-test.<commit>": each one counts as a new version.
const suffix = process.env.VERSION_SUFFIX ?? '';

/**
 * This version's changes from CHANGELOG.md, for the "What's new" sheet: an intro paragraph
 * and the items of each section. Test builds show what's still under [Unreleased].
 */
function releaseNotes() {
  const sections = readFileSync('CHANGELOG.md', 'utf8').split(/^## /m).slice(1);
  const heading = suffix ? '[Unreleased]' : `[${pkg.version}]`;
  const section = sections.find((s) => s.startsWith(heading)) ?? '';
  const notes = { intro: '', groups: [] as { title: string; items: string[] }[] };
  for (const line of section.split('\n').slice(1)) {
    const group = notes.groups.at(-1);
    if (line.startsWith('### ')) notes.groups.push({ title: line.slice(4).trim(), items: [] });
    else if (line.startsWith('- ') && group) group.items.push(line.slice(2).trim());
    else if (line.startsWith('  ') && group?.items.length)
      group.items[group.items.length - 1] += ` ${line.trim()}`;
    else if (line.trim() && !group) notes.intro += `${notes.intro ? ' ' : ''}${line.trim()}`;
  }
  return notes;
}

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version + suffix),
    __RELEASE_NOTES__: JSON.stringify(releaseNotes()),
  },
  // Classic workers: no reliance on module workers in older Android WebViews.
  worker: { format: 'iife' },
  test: {
    // Its ES modules import without file extensions, which Node can't resolve on its own.
    server: { deps: { inline: ['@material/material-color-utilities'] } },
  },
});
