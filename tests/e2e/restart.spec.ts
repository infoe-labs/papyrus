import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('offline sleep timer survives closing the entire browser and reopening its profile', async ({}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile',
    'Persistent desktop process test; mobile viewport recovery is covered separately.',
  );
  const dir = await mkdtemp(join(tmpdir(), 'papyrus-restart-'));
  const url = `http://127.0.0.1:4173${process.env.TEST_BASE_PATH ?? '/'}`;
  const opts = {
    headless: true,
    executablePath: process.env.CI ? undefined : '/usr/bin/google-chrome',
    args: ['--no-sandbox'],
  };
  let context = await chromium.launchPersistentContext(dir, opts);
  try {
    let page = await context.newPage();
    await page.goto(url);
    await page.getByLabel('First name').fill('River');
    await page.getByRole('button', { name: 'Create profile' }).click();
    await page.getByRole('heading', { name: 'River’s little world.' }).waitFor();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.locator('.tracking-tile').filter({ hasText: 'Sleep' }).click();
    await page.getByRole('button', { name: 'Start timer' }).click();
    await expect(page.getByText('TRACKING SLEEP', { exact: false })).toBeVisible();
    await context.close();
    context = await chromium.launchPersistentContext(dir, opts);
    await context.setOffline(true);
    page = await context.newPage();
    await page.goto(url);
    await expect(page.getByText('TRACKING SLEEP', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'End', exact: true }).click();
    await page.getByRole('button', { name: 'Save session' }).click();
    await expect(page.getByText('TRACKING SLEEP', { exact: false })).not.toBeVisible();
    await expect(page.locator('.event-row')).toHaveCount(1);
  } finally {
    await context.close();
    await rm(dir, { recursive: true, force: true });
  }
});
