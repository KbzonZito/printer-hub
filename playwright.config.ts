import { defineConfig, devices } from '@playwright/test';

// End-to-end tests: the web app (Vite) against the simulated Moonraker, on a phone-sized
// screen. `npm run e2e`. The ports differ from `npm run dev` / `npm run mock`, so both can run.

export const MOCK_PORT = 7330;
const APP_PORT = 5180;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  // The simulator is one printer shared by every test: run them one after another.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: `http://localhost:${APP_PORT}`,
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `node scripts/mock-moonraker.mjs`,
      env: { MOCK_PORT: String(MOCK_PORT), MOCK_FILE_RATE: '0' },
      url: `http://127.0.0.1:${MOCK_PORT}/server/info`,
      reuseExistingServer: false,
    },
    {
      command: `npx vite --port ${APP_PORT} --strictPort`,
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: false,
    },
  ],
});
