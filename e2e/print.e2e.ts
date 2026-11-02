import { expect, test } from '@playwright/test';
import { moonraker, openWithPrinter } from './helpers';

test('excluding a part of the print from Home', async ({ page }) => {
  await moonraker('/printer/print/start?filename=Benchy_PLA_0.2mm.gcode');
  await openWithPrinter(page);

  await page.getByRole('button', { name: /Objects \(3\/3\)/ }).click();
  const sheet = page.getByRole('dialog');
  // Pick the box from the list (the same parts are drawn on the bed map).
  await sheet.locator('.select-option', { hasText: 'BOX' }).click();
  await sheet.getByRole('button', { name: 'Exclude BOX' }).click();
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: 'Exclude', exact: true })
    .click();

  await expect(sheet.locator('.select-option', { hasText: 'BOX' })).toContainText('Excluded');
  await expect(sheet.locator('.bed-object.excluded')).toHaveCount(1);
  const state = await moonraker('/printer/objects/query?exclude_object=excluded_objects', 'GET');
  expect(state.result.status.exclude_object.excluded_objects).toEqual(['BOX.STL_ID_1_COPY_0']);
});

test('the emergency stop asks first, and Back does not send it', async ({ page }) => {
  await openWithPrinter(page);
  await page.getByRole('button', { name: 'Emergency stop' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText('Emergency stop?');
  await confirm.getByRole('button', { name: 'Back' }).click();
  // Not sent: Klipper is still printing.
  expect((await moonraker('/printer/info', 'GET')).result.state).toBe('ready');
});
