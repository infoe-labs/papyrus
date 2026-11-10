import { z } from 'zod';
import { categories, childSchema, eventSchema } from './model';
const finite = z.number().finite();
const id = z.string().min(1);
const base = { id, childId: id };
export const sessionSchema = z
  .object({
    ...base,
    category: z.enum(categories),
    startedAt: finite,
    endedAt: z.null(),
    status: z.enum(['active', 'paused']),
    pausedIntervals: z.array(z.object({ start: finite, end: finite.nullable() })),
    metadata: z.record(
      z.string(),
      z.union([z.string(), finite, z.boolean(), z.array(z.string()), z.null()]),
    ),
    notes: z.string().optional(),
    createdAt: finite,
    updatedAt: finite,
    segments: z.array(
      z.object({ side: z.enum(['left', 'right']), start: finite, end: finite.nullable() }),
    ),
  })
  .superRefine((s, c) => {
    for (const p of s.pausedIntervals)
      if (p.start < s.startedAt || (p.end !== null && p.end < p.start))
        c.addIssue({ code: 'custom', message: 'Invalid pause interval' });
    for (const p of s.segments)
      if (p.start < s.startedAt || (p.end !== null && p.end < p.start))
        c.addIssue({ code: 'custom', message: 'Invalid nursing segment' });
    if (s.status === 'paused' && !s.pausedIntervals.some((p) => p.end === null))
      c.addIssue({ code: 'custom', message: 'Paused timer requires an open pause interval' });
  });
export const scheduleSchema = z.object({
  ...base,
  name: z.string().min(1),
  wake: z.string().regex(/^\d{2}:\d{2}$/),
  bed: z.string().regex(/^\d{2}:\d{2}$/),
  naps: z.array(z.object({ start: z.string(), end: z.string() })),
  createdAt: finite,
});
export const planSchema = z.object({
  ...base,
  createdAt: finite,
  version: z.number().int().positive(),
  intake: z.record(z.string(), z.string()),
  steps: z.array(z.object({ title: z.string(), detail: z.string(), done: z.boolean() })),
  notes: z.string(),
  baseline: finite.nullable(),
  checkInDays: z.number().min(1).max(60),
  suggestedSchedule: scheduleSchema.optional(),
});
export const reminderSchema = z.object({
  ...base,
  name: z.string().min(1),
  category: z.enum(categories),
  nextAt: finite,
  intervalHours: z.number().min(0),
  enabled: z.boolean(),
});
export const customSchema = z
  .object({
    id,
    name: z.string().min(1),
    fields: z.array(
      z.object({
        name: z.string().min(1),
        type: z.enum([
          'text',
          'number',
          'boolean',
          'single-select',
          'multi-select',
          'timestamp',
          'duration',
        ]),
        options: z.array(z.string()).optional(),
      }),
    ),
  })
  .superRefine((d, c) => {
    if (new Set(d.fields.map((f) => f.name)).size !== d.fields.length)
      c.addIssue({ code: 'custom', message: 'Custom field names must be unique' });
  });
export const backupSchema = z.object({
  format: z.literal('papyrus'),
  version: z.literal(1),
  appVersion: z.string(),
  exportedAt: finite,
  children: z.array(childSchema),
  events: z.array(eventSchema),
  sessions: z.array(sessionSchema),
  settings: z.array(z.object({ key: z.string(), value: z.unknown() })),
  schedules: z.array(scheduleSchema),
  plans: z.array(planSchema),
  reminders: z.array(reminderSchema),
  customTrackers: z.array(customSchema),
  imports: z.array(z.object({ id, at: finite, file: z.string(), count: z.number().int().min(0) })),
  media: z.array(z.object({ id, data: z.string() })),
});
