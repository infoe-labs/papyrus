import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import EventEditor from '../src/components/EventEditor';
import { Context, type AppContext } from '../src/lib/context';
import { db, saveChild } from '../src/lib/db';
import { makeEvent, type Child, type Category } from '../src/lib/model';
const child: Child = {
  id: 'form-child',
  name: 'Willow',
  dob: '2026-05-01',
  sex: 'female',
  gestationWeeks: 40,
  createdAt: 1,
};
const value: AppContext = {
  child,
  children: [child],
  events: [],
  sessions: [],
  settings: {},
  log: vi.fn(),
  open: vi.fn(),
  notify: vi.fn(),
};
beforeEach(async () => {
  localStorage.clear();
  await db.open();
  await db.events.clear();
  await saveChild(child);
});
afterEach(cleanup);
function editor(category: Category) {
  render(
    <Context.Provider value={value}>
      <EventEditor childId={child.id} category={category} onClose={vi.fn()} onSaved={vi.fn()} />
    </Context.Provider>,
  );
}
it('conditional mixed diaper fields save independent observations without filling unknowns', async () => {
  editor('diaper');
  expect(screen.queryByRole('combobox', { name: 'Stool consistency' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'mixed' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Urine amount' }), {
    target: { value: 'little' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Stool amount' }), {
    target: { value: 'big' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'green' }));
  fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Observed, not assumed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  await waitFor(async () => expect(await db.events.count()).toBe(1));
  const event = await db.events.toCollection().first();
  expect(event?.data).toMatchObject({
    type: 'mixed',
    urineAmount: 'little',
    stoolAmount: 'big',
    color: 'green',
  });
  expect(event?.data.consistency).toBeUndefined();
  expect(event?.notes).toBe('Observed, not assumed');
});
it('converts bottle units at the input boundary and uses actual consumption', async () => {
  editor('bottle');
  fireEvent.change(screen.getByLabelText('Volume unit'), { target: { value: 'oz' } });
  fireEvent.change(screen.getByLabelText(/^Quantity offered/), { target: { value: '5' } });
  fireEvent.change(screen.getByLabelText(/^Quantity consumed/), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  await waitFor(async () => expect(await db.events.count()).toBe(1));
  const e = await db.events.toCollection().first();
  expect(e?.data.offered).toBe(147868);
  expect(e?.data.consumed).toBe(88721);
});
it('editing preserves provenance and stable ID', async () => {
  const e = makeEvent(child.id, 'diaper', Date.now(), { type: 'poop' });
  e.provenance = {
    source: 'huckleberry',
    sourceFileName: 'old.csv',
    importBatchId: 'b',
    originalRowNumber: 2,
    originalValues: { Type: 'Diaper' },
    sourceTimezone: 'America/Los_Angeles',
    importedAt: 1,
    sourceFingerprint: 'original',
    parsingWarnings: [],
    sourceKey: 'key',
  };
  await db.events.put(e);
  render(
    <Context.Provider value={value}>
      <EventEditor
        childId={child.id}
        category="diaper"
        event={e}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </Context.Provider>,
  );
  fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Updated' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  await waitFor(async () => expect((await db.events.get(e.id))?.notes).toBe('Updated'));
  expect((await db.events.get(e.id))?.provenance?.sourceFingerprint).toBe('original');
  expect(await db.events.count()).toBe(1);
});

it('supports pounds and ounces without changing canonical kg storage', async () => {
  editor('growth');
  fireEvent.change(screen.getByLabelText('Weight unit'), { target: { value: 'lb/oz' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: /^Weight ·/ }), {
    target: { value: '7' },
  });
  fireEvent.change(screen.getByLabelText('Additional weight ounces'), { target: { value: '8' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  await waitFor(async () => expect(await db.events.count()).toBe(1));
  expect((await db.events.toCollection().first())?.data.weight).toBeCloseTo(7.5 * 0.45359237, 8);
});

it('persists all custom field types as actual structured values', async () => {
  await db.customTrackers.clear();
  await db.customTrackers.add({
    id: 'seven-fields',
    name: 'Daily extras',
    fields: [
      { name: 'Text', type: 'text' },
      { name: 'Count', type: 'number' },
      { name: 'Observed', type: 'boolean' },
      { name: 'Choice', type: 'single-select', options: ['one', 'two'] },
      { name: 'Choices', type: 'multi-select', options: ['alpha', 'beta'] },
      { name: 'When', type: 'timestamp' },
      { name: 'Time spent', type: 'duration' },
    ],
  });
  editor('custom');
  await waitFor(() =>
    expect(screen.getByRole('option', { name: 'Daily extras' })).toBeInTheDocument(),
  );
  fireEvent.change(screen.getByLabelText('Custom tracker'), { target: { value: 'seven-fields' } });
  fireEvent.change(screen.getByLabelText('Event name'), {
    target: { value: 'Custom observation' },
  });
  fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'A detail' } });
  fireEvent.change(screen.getByLabelText('Count'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Observed'), { target: { value: 'true' } });
  fireEvent.change(screen.getByLabelText('Choice'), { target: { value: 'two' } });
  fireEvent.click(screen.getByRole('button', { name: 'alpha' }));
  fireEvent.click(screen.getByRole('button', { name: 'beta' }));
  fireEvent.change(screen.getByLabelText('When'), { target: { value: '2026-11-08T10:00' } });
  fireEvent.change(screen.getByLabelText(/^Time spent/), { target: { value: '4.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  await waitFor(async () => expect(await db.events.count()).toBe(1));
  const e = await db.events.toCollection().first();
  expect(e?.data).toMatchObject({
    'custom:Text': 'A detail',
    'custom:Count': 3,
    'custom:Observed': true,
    'custom:Choice': 'two',
    'custom:Choices': ['alpha', 'beta'],
    'custom:When': new Date('2026-11-08T10:00').getTime(),
    'custom:Time spent': 270000,
  });
});
