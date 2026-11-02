import { expect, test } from '@playwright/test';
// @ts-expect-error plain JS module without types
import { generateGcode } from '../scripts/gen-gcode.mjs';
import { moonraker, nav, openWithPrinter } from './helpers';

test('folders, upload, move, preview and print', async ({ page }) => {
  const folder = `e2e-${Date.now()}`;
  const file = `cube-${Date.now()}.gcode`;
  await openWithPrinter(page);
  await nav(page, 'Files');

  // New folder.
  await page.getByRole('button', { name: 'New folder' }).click();
  const nameSheet = page.getByRole('dialog');
  await nameSheet.getByLabel('Name').fill(folder);
  await nameSheet.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('.file-row', { hasText: folder })).toBeVisible();

  // Upload a G-code into the current (root) folder.
  await page.locator('input[type=file]').setInputFiles({
    name: file,
    mimeType: 'text/plain',
    buffer: Buffer.from(generateGcode(0.2)),
  });
  await expect(page.getByText(`${file} uploaded`)).toBeVisible();
  const row = page.locator('.file-row', { hasText: file.replace('.gcode', '') });
  await expect(row).toBeVisible();

  // Move it into the folder.
  await row.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Move' }).click();
  const picker = page.getByRole('dialog').last();
  await picker.locator('.select-option', { hasText: folder }).click();
  await picker.getByRole('button', { name: 'Move here' }).click();
  await expect(row).toHaveCount(0);
  await page.locator('.file-row', { hasText: folder }).click();
  await expect(page.locator('.breadcrumbs')).toContainText(folder);
  const moved = page.locator('.file-row', { hasText: file.replace('.gcode', '') });
  await expect(moved).toBeVisible();

  // Layer preview of the uploaded file.
  await moved.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Preview' }).click();
  await expect(page.locator('.gcode-layer-text')).toContainText(/Layer 1 of \d+/);
  await page.getByRole('button', { name: 'Next layer' }).click();
  await expect(page.locator('.gcode-layer-text')).toContainText('Layer 2 of');
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.gcode-viewer')).toHaveCount(0);

  // Print it (the simulator is printing another file: stop that first).
  await moonraker('/printer/print/cancel');
  await moved.click();
  const details = page.getByRole('dialog');
  await expect(details.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
  await details.getByRole('button', { name: 'Print', exact: true }).click();
  await expect(page.getByText('Print started')).toBeVisible();
  await expect(page.locator('.job-head')).toContainText(file.replace('.gcode', ''));
});
