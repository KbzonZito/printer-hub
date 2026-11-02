import { expect, test } from '@playwright/test';
import { MOCK_PORT } from '../playwright.config';

test('a new user sets up the app and adds the printer by IP', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();

  // Appearance and requirements.
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // Add the printer by IP; the app tests the connection and suggests the hostname.
  await expect(page.getByRole('heading', { name: 'Add your printer' })).toBeVisible();
  await page.getByRole('button', { name: /Enter the IP/ }).click();
  await page.getByLabel('Printer IP').fill('127.0.0.1');
  await page.getByLabel('Port').fill(String(MOCK_PORT));
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByRole('heading', { name: 'Printer connected' })).toBeVisible();
  await expect(page.getByLabel('Printer name')).toHaveValue('creality-hi');
  await page.getByRole('button', { name: 'Save printer' }).click();

  await expect(page.getByRole('heading', { name: 'All set!' })).toBeVisible();
  await page.getByRole('button', { name: 'Start using the app' }).click();

  // Home with live data from the printer.
  await expect(page.getByRole('heading', { name: 'creality-hi', level: 1 })).toBeVisible();
  await expect(page.getByText('Printing', { exact: true }).first()).toBeVisible();
});

test('a wrong address shows an error and lets the user try again', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /Enter the IP/ }).click();
  await page.getByLabel('Printer IP').fill('127.0.0.1');
  await page.getByLabel('Port').fill('7399');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('Could not connect to 127.0.0.1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect' })).toBeEnabled();
});
