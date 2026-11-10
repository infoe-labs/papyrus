import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
async function localTime(page: Page) {
  return page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  });
}
async function database(page: Page) {
  return page.evaluate(async () => {
    const name = localStorage.getItem('papyrus-active-database') || 'papyrus';
    const request = indexedDB.open(name);
    const db = await new Promise<IDBDatabase>(
      (resolve) => (request.onsuccess = () => resolve(request.result)),
    );
    const read = async (table: string) => {
      const req = db.transaction(table).objectStore(table).getAll();
      return new Promise<Record<string, unknown>[]>(
        (resolve) => (req.onsuccess = () => resolve(req.result)),
      );
    };
    const events = await read('events'),
      children = await read('children'),
      sessions = await read('sessions'),
      state = (await read('backupState'))[0];
    db.close();
    return { name, events, children, sessions, state };
  });
}
async function createProfile(page: Page) {
  await page.goto('./');
  await page.getByLabel('First name').fill('Example baby');
  await page.getByLabel('Date of birth').fill('2026-01-01');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.getByRole('heading', { name: 'Example baby’s little world.' }).waitFor();
}
async function inspect(page: Page, path: string, testOnly = false) {
  await page
    .getByRole('button', { name: testOnly ? 'Test Backup' : 'Restore from Backup', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Select external backup', { exact: true }).setInputFiles(path);
  await dialog.getByRole('button', { name: 'Inspect file', exact: false }).click();
  await dialog.getByRole('button', { name: 'Review validation', exact: false }).click();
  await dialog.getByRole('button', { name: 'Test restore in isolation' }).click();
  await dialog.getByText('Test restore passed.', { exact: false }).waitFor();
  return dialog;
}
test('external backup survives complete IndexedDB loss, offline test restore, timer review and repeat merge', async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await createProfile(page);
  await page.locator('.tracking-tile').filter({ hasText: 'Diaper' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'mixed', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Urine amount', exact: true }).selectOption('little');
  await dialog.getByRole('combobox', { name: 'Stool amount', exact: true }).selectOption('big');
  await dialog
    .getByRole('textbox', { name: 'Notes', exact: true })
    .fill('Bé ngủ ngon, "đã ghi" 🌱');
  await dialog.getByRole('button', { name: 'Save entry' }).click();
  await page.locator('.tracking-tile').filter({ hasText: 'Bottle' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Milk type', exact: true }).selectOption('formula');
  await dialog.getByRole('spinbutton', { name: /^Quantity offered/ }).fill('120');
  await dialog.getByRole('spinbutton', { name: /^Quantity consumed/ }).fill('90');
  await dialog.getByRole('button', { name: 'Save entry' }).click();
  await page.locator('.tracking-tile').filter({ hasText: 'Sleep' }).click();
  await page.getByRole('button', { name: 'Start timer' }).click();
  await page.getByText('TRACKING SLEEP', { exact: false }).waitFor();
  await page.goto('./#/settings');
  const before = await database(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back Up Now', exact: true }).click();
  const downloaded = await downloadPromise;
  expect(downloaded.suggestedFilename()).toMatch(/^babytracker-backup-.*\.json$/);
  const file = testInfo.outputPath('synthetic-external-backup.json');
  await downloaded.saveAs(file);
  const envelope = JSON.parse(await readFile(file, 'utf8'));
  expect(envelope).toMatchObject({
    format: 'babytracker-backup',
    formatVersion: 1,
    payloadHashAlgorithm: 'SHA-256',
  });
  expect(envelope.payload.events).toHaveLength(2);
  expect(envelope.payload.sessions).toHaveLength(1);
  expect((await database(page)).state?.lastExternallyVerifiedAt).toBeUndefined();
  await page.getByRole('button', { name: 'I saved it', exact: true }).click();
  await expect(
    page.getByText('This is self-reported, not filesystem verification.', { exact: false }),
  ).toBeVisible();
  expect((await database(page)).state?.lastExternallyVerifiedAt).toBeUndefined();
  dialog = await inspect(page, file, true);
  await dialog.getByRole('button', { name: 'Finish test' }).click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  expect((await database(page)).events).toEqual(before.events);
  expect((await database(page)).name).toBe(before.name);
  expect((await database(page)).state?.lastExternallyVerifiedAt).toBeTruthy();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const base = new URL(process.env.TEST_BASE_PATH ?? '/', page.url()).toString();
  const origin = new URL(page.url()).origin;
  await page.goto('about:blank');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'indexeddb,local_storage' });
  await cdp.detach();
  await context.setOffline(true);
  await page.goto(base);
  await expect(
    page.getByRole('heading', { name: 'Every little moment starts a story.' }),
  ).toBeVisible();
  expect((await database(page)).children).toHaveLength(0);
  dialog = await inspect(page, file);
  await dialog.getByRole('button', { name: 'Choose restore mode' }).click();
  await dialog.getByLabel('Restore mode', { exact: true }).selectOption('replace');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Confirm replacement' }).click();
  await expect(page.getByRole('heading', { name: 'Example baby’s little world.' })).toBeVisible();
  const recovered = await database(page);
  expect(recovered.events).toEqual(before.events);
  expect(recovered.children).toEqual(before.children);
  expect(recovered.sessions).toHaveLength(1);
  expect((recovered.sessions[0].metadata as Record<string, unknown>).recoveryRequired).toBe(true);
  await expect(page.getByText('TRACKING SLEEP', { exact: false })).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Recovered unfinished sleep session' }),
  ).toBeVisible();
  await page.getByLabel('Actual ending time', { exact: true }).fill(await localTime(page));
  await page.getByRole('button', { name: 'Save corrected completed session' }).click();
  await expect.poll(async () => (await database(page)).sessions.length).toBe(0);
  await expect.poll(async () => (await database(page)).events.length).toBe(3);
  await page.goto('./#/settings');
  dialog = await inspect(page, file);
  await dialog.getByRole('button', { name: 'Choose restore mode' }).click();
  await dialog.getByLabel('Restore mode', { exact: true }).selectOption('merge');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Confirm merge' }).click();
  await expect(dialog).not.toBeVisible();
  expect((await database(page)).events).toHaveLength(3);
  expect((await database(page)).sessions).toHaveLength(0);
  await page.goto('./#/reports');
  await expect(
    page.getByRole('heading', { name: 'Little patterns, meaningful days.' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test('light and dark themes have strong heading and body contrast without horizontal overflow', async ({
  page,
}) => {
  await createProfile(page);
  for (const theme of ['light', 'dark']) {
    await page.goto('./#/settings');
    await page.getByRole('combobox', { name: 'Appearance', exact: true }).selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.goto('./#/');
    const ratios = await page.evaluate(() => {
      function rgb(css: string) {
        return css
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
      }
      function luminance(c: number[]) {
        return c
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
      }
      function contrast(fg: string, bg: string) {
        const a = luminance(rgb(fg)),
          b = luminance(rgb(bg));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      }
      const h = document.querySelector('h1')!,
        body = getComputedStyle(document.body),
        heading = getComputedStyle(h),
        metric = document.querySelector('.metric-title')!,
        metricBox = metric.closest('.metric')!,
        muted = document.querySelector('.page-title p')!;
      return {
        heading: contrast(heading.color, body.backgroundColor),
        secondary: contrast(getComputedStyle(muted).color, body.backgroundColor),
        metric: contrast(
          getComputedStyle(metric).color,
          getComputedStyle(metricBox).backgroundColor,
        ),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    expect(ratios.heading).toBeGreaterThan(7);
    expect(ratios.secondary).toBeGreaterThanOrEqual(4.5);
    expect(ratios.metric).toBeGreaterThanOrEqual(4.5);
    expect(ratios.overflow).toBe(false);
  }
});
