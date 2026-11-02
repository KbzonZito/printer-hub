import type { Page } from '@playwright/test';
import { MOCK_PORT } from '../playwright.config';

export const MOCK = `http://127.0.0.1:${MOCK_PORT}`;

/** Starts the app with the simulated printer already added (skips the welcome wizard). */
export async function openWithPrinter(page: Page) {
  await page.addInitScript((port) => {
    if (localStorage.getItem('printer-hub:v1')) return;
    localStorage.setItem(
      'printer-hub:v1',
      JSON.stringify({
        printers: [
          {
            id: 'e2e',
            name: 'creality-hi',
            host: '127.0.0.1',
            port,
            cameraMode: 'auto',
            cameraUrl: '',
          },
        ],
        activeId: 'e2e',
        settings: { lang: 'en', onboarded: true },
      }),
    );
  }, MOCK_PORT);
  await page.goto('/');
}

/** Moonraker HTTP call to the simulator, to set it up for a test. */
export async function moonraker(path: string, method = 'POST') {
  const res = await fetch(MOCK + path, { method });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export const nav = (page: Page, name: 'Home' | 'Control' | 'Files' | 'Settings') =>
  page.locator('.tabbar').getByRole('button', { name }).click();
