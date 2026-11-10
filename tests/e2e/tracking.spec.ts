import { test, expect, type Page } from '@playwright/test';
async function records(page: Page) {
  return page.evaluate(async () => {
    const r = indexedDB.open('papyrus');
    const d = await new Promise<IDBDatabase>((resolve) => (r.onsuccess = () => resolve(r.result)));
    const q = d.transaction('events').objectStore('events').getAll();
    const result = await new Promise<
      { id: string; category: string; notes: string; data: Record<string, unknown> }[]
    >((resolve) => (q.onsuccess = () => resolve(q.result)));
    d.close();
    return result;
  });
}
test('every native module supports a detailed saved record, notes, edit and confirmed deletion', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByLabel('First name').fill('Willow');
  await page.getByLabel('Date of birth').fill('2026-04-01');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.getByRole('heading', { name: 'Willow’s little world.' }).waitFor();
  await page.goto('./#/settings');
  for (const name of ['Milestones', 'Contractions', 'Custom tracker'])
    await page.getByRole('checkbox', { name, exact: true }).check();
  await page.goto('./#/');
  const scenarios: {
    category: string;
    tile: string;
    fields: [string, string][];
    selects?: [string, string][];
    end?: boolean;
  }[] = [
    { category: 'sleep', tile: 'Sleep', fields: [], end: true },
    {
      category: 'nursing',
      tile: 'Nursing',
      fields: [
        ['Left breast', '5'],
        ['Right breast', '3'],
      ],
    },
    {
      category: 'bottle',
      tile: 'Bottle',
      fields: [
        ['Quantity offered', '120'],
        ['Quantity consumed', '90'],
      ],
      selects: [['Milk type', 'formula']],
    },
    {
      category: 'pumping',
      tile: 'Pumping',
      fields: [
        ['Left-side output', '50'],
        ['Right-side output', '60'],
      ],
      end: true,
    },
    { category: 'diaper', tile: 'Diaper', fields: [] },
    {
      category: 'solids',
      tile: 'Solids',
      fields: [
        ['Food items', 'avocado, oat'],
        ['Quantity and unit', '2 tsp'],
      ],
      selects: [['Baby’s reaction', 'loved']],
    },
    {
      category: 'medicine',
      tile: 'Medicine',
      fields: [
        ['Medication name', 'As instructed'],
        ['Dose amount', '1'],
        ['Dose unit', 'mL'],
      ],
    },
    {
      category: 'growth',
      tile: 'Growth',
      fields: [
        ['Weight', '6.8'],
        ['Length / height', '65'],
        ['Head circumference', '42'],
      ],
    },
    {
      category: 'temperature',
      tile: 'Temperature',
      fields: [['Temperature', '37.1']],
      selects: [['Measurement method', 'axillary']],
    },
    {
      category: 'potty',
      tile: 'Potty',
      fields: [],
      selects: [
        ['Result', 'attempt without success'],
        ['Location', 'potty'],
      ],
    },
    { category: 'activity', tile: 'Activities', fields: [['Duration', '8']] },
    {
      category: 'milestone',
      tile: 'Milestones',
      fields: [['Milestone achieved', 'A first little smile']],
    },
    {
      category: 'contraction',
      tile: 'Contractions',
      fields: [['Duration', '1']],
      selects: [['Intensity', 'mild']],
    },
    {
      category: 'custom',
      tile: 'Custom tracker',
      fields: [['Event name', 'A special observation']],
    },
  ];
  for (const scenario of scenarios) {
    await page.locator('.tracking-tile').filter({ hasText: scenario.tile }).click();
    const dialog = page.getByRole('dialog');
    const start = '2026-11-08T09:00';
    await dialog.getByLabel('Start / event time', { exact: true }).fill(start);
    if (scenario.end) await dialog.getByLabel(/End time/).fill(start.slice(0, 10) + 'T09:30');
    for (const [label, value] of scenario.fields)
      await dialog
        .getByLabel(new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        .and(dialog.locator('input'))
        .fill(value);
    for (const [label, value] of scenario.selects ?? [])
      await dialog.getByRole('combobox', { name: new RegExp('^' + label) }).selectOption(value);
    await dialog.getByLabel('Notes', { exact: true }).fill(`Observation for ${scenario.category}`);
    await dialog.getByRole('button', { name: 'Save entry' }).click();
    await expect(dialog).not.toBeVisible();
    expect((await records(page)).find((e) => e.category === scenario.category)?.notes).toBe(
      `Observation for ${scenario.category}`,
    );
  }
  expect(await records(page)).toHaveLength(14);
  await page.goto('./#/history');
  await page.getByLabel('Selected date').fill('2026-11-08');
  await page.locator('.event-row').first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('Edited after observing');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect
    .poll(async () => (await records(page)).some((e) => e.notes === 'Edited after observing'))
    .toBe(true);
  await page.locator('.event-row').first().click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(async () => (await records(page)).length).toBe(13);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await records(page)).length).toBe(14);
});
