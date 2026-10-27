/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    // Its ES modules import without file extensions, which Node can't resolve on its own.
    server: { deps: { inline: ['@material/material-color-utilities'] } },
  },
});
