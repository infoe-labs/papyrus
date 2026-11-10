import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
const fixture = path.resolve('tests/fixtures/huckleberry-synthetic.csv');
async function child(page: Page) {
  await page.goto('./');
  await page.getByLabel('First name').fill('River');
  await page.getByLabel('Date of birth').fill('2019-05-01');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.getByRole('heading', { name: 'River’s little world.' })).toBeVisible();
}
async function settings(page: Page) {
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible();
}
async function importFixture(page: Page) {
  await page.getByRole('button', { name: 'Import Huckleberry CSV', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Huckleberry CSV file').setInputFiles(fixture);
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByLabel('Source timezone', { exact: true }).fill('America/Los_Angeles');
  await dialog.getByLabel('I confirm this is the source timezone.').check();
  await dialog.getByRole('button', { name: 'Preview import', exact: false }).click();
  await expect(dialog.getByText('Total rows', { exact: true })).toBeVisible();
  await expect(dialog.getByText('8', { exact: true }).first()).toBeVisible();
  await dialog.getByRole('button', { name: /Import \d+ records/ }).click();
  await expect(dialog.getByRole('heading', { name: 'Your history is home.' })).toBeVisible();
  return dialog;
}
async function getEvents(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('papyrus');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = database.transaction('events');
    const r = tx.objectStore('events').getAll();
    const result = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    database.close();
    return result;
  });
}
for (const offline of [false, true])
  test(`synthetic eight-row migration and persistent timer ${offline ? 'offline' : 'online'}`, async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await child(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    if (offline) await context.setOffline(true);
    await settings(page);
    const result = await importFixture(page);
    await expect(result.getByText('8', { exact: true }).first()).toBeVisible();
    await result.getByRole('button', { name: 'Back to Papyrus', exact: false }).click();
    const events = await getEvents(page);
    expect(events).toHaveLength(8);
    const data = events as {
      category: string;
      data: Record<string, unknown>;
      start: number;
      end: number | null;
    }[];
    expect(data.filter((e) => e.category === 'sleep')).toHaveLength(2);
    expect(data.find((e) => e.category === 'pumping')?.data.output).toBe(100000);
    expect(data.find((e) => e.category === 'nursing')?.data).toMatchObject({
      leftMs: 60000,
      rightMs: 60000,
    });
    expect(
      data
        .filter((e) => e.category === 'bottle')
        .map((e) => e.data.consumed)
        .sort(),
    ).toEqual([29574, 138996].sort());
    expect(
      data
        .filter((e) => e.category === 'diaper')
        .map((e) => e.data.type)
        .sort(),
    ).toEqual(['pee', 'poop']);
    expect(
      data.filter((e) => e.category === 'sleep').find((e) => e.end! - e.start > 3600000)!.end! -
        data.filter((e) => e.category === 'sleep').find((e) => e.end! - e.start > 3600000)!.start,
    ).toBe(30000000);
    await page.goto('./#/');
    await page.getByLabel('Selected date').fill('2020-01-03');
    await expect(page.locator('.rings-card svg path[role="button"]')).toHaveCount(3);
    await expect(page.locator('.actogram .sleep-block')).toHaveCount(3);
    await expect(page.locator('.feed-list').getByText('Wet diaper', { exact: true })).toBeVisible();
    await page.locator('.tracking-tile').filter({ hasText: 'Sleep' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Start timer' }).click();
    await expect(page.getByText('TRACKING SLEEP', { exact: false })).toBeVisible();
    await page.reload();
    await expect(page.getByText('TRACKING SLEEP', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'End', exact: true }).click();
    await page.getByRole('button', { name: 'Save session', exact: true }).click();
    await expect.poll(async () => (await getEvents(page)).length).toBe(9);
    await settings(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download full backup', exact: true }).click();
    const backup = await downloadPromise;
    const backupPath = await backup.path();
    expect(backupPath).toBeTruthy();
    const repeated = await importFixture(page);
    await expect(repeated.getByText('Duplicates skipped', { exact: true })).toBeVisible();
    await repeated.getByRole('button', { name: 'Back to Papyrus', exact: false }).click();
    expect(await getEvents(page)).toHaveLength(9);
    await page
      .locator('input[type=file][accept=".json,application/json"]')
      .setInputFiles(backupPath!);
    await page.getByRole('button', { name: 'Confirm merge', exact: true }).click();
    expect(await getEvents(page)).toHaveLength(9);
    await page.goto('./#/reports');
    await expect(
      page.getByRole('heading', { name: 'Little patterns, meaningful days.' }),
    ).toBeVisible();
    await page.goto('./#/planner');
    await expect(page.getByRole('heading', { name: 'Make room for rest.' })).toBeVisible();
    await page.goto('./#/history');
    await expect(page.getByRole('heading', { name: 'Every moment, remembered.' })).toBeVisible();
    expect(errors).toEqual([]);
  });
test('mobile and desktop stay within viewport and detailed diaper fields are conditional', async ({
  page,
}) => {
  await child(page);
  await page.locator('.tracking-tile').filter({ hasText: 'Diaper' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('combobox', { name: 'Stool consistency', exact: true }),
  ).not.toBeVisible();
  await dialog.getByRole('button', { name: 'mixed', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Urine amount', exact: true })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Stool amount', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'green', exact: true }).click();
  await dialog.getByLabel('Notes', { exact: true }).fill('Detailed observation');
  await dialog.getByRole('button', { name: 'Save entry' }).click();
  expect((await getEvents(page))[0]).toMatchObject({
    category: 'diaper',
    data: { type: 'mixed', color: 'green' },
    notes: 'Detailed observation',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
