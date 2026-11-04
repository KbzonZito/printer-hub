import { expect, test } from '@playwright/test';
import { nav, openWithPrinter } from './helpers';

test('a new user tries the app with the demo printer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /Try without a printer/ }).click();
  await expect(page.getByRole('heading', { name: 'All set!' })).toBeVisible();
  await page.getByRole('button', { name: 'Start using the app' }).click();

  // The simulated printer, without any network: a print in progress, files and preview.
  await expect(page.getByRole('heading', { name: 'Demo printer', level: 1 })).toBeVisible();
  await expect(page.getByText('Demo mode')).toBeVisible();
  await expect(page.getByText('Printing', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('Paused', { exact: true }).first()).toBeVisible();

  await nav(page, 'Files');
  await page.getByText('Calibration_cube').click();
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByText(/Layer 1 of \d+/)).toBeVisible();
});

test('"What\'s new" opens once after an update', async ({ page }) => {
  await openWithPrinter(page, '0.9.0');
  await expect(page.getByRole('heading', { name: /What's new in/ })).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('heading', { name: /What's new in/ })).toBeHidden();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'creality-hi', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /What's new in/ })).toBeHidden();
});
