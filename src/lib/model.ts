import { z } from 'zod';
export const categories = [
  'sleep',
  'nursing',
  'bottle',
  'pumping',
  'diaper',
  'solids',
  'medicine',
  'growth',
  'temperature',
  'potty',
  'activity',
  'milestone',
  'contraction',
  'custom',
] as const;
export type Category = (typeof categories)[number];
export type Value = string | number | boolean | string[] | null;
export interface NursingSegment {
  side: 'left' | 'right';
  start: number;
  end: number | null;
}
export interface Provenance {
  source: 'huckleberry';
  sourceFileName: string;
  importBatchId: string;
  originalRowNumber: number;
  originalValues: Record<string, string>;
  sourceTimezone: string;
  importedAt: number;
  sourceFingerprint: string;
  parsingWarnings: string[];
  sourceKey: string;
}
export const childSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sex: z.enum(['female', 'male', 'unspecified']),
  gestationWeeks: z.number().min(20).max(45),
  createdAt: z.number(),
  photo: z.string().optional(),
});
export type Child = z.infer<typeof childSchema>;
export const eventSchema = z.object({
  id: z.string().min(1),
  childId: z.string().min(1),
  category: z.enum(categories),
  start: z.number().finite(),
  end: z.number().finite().nullable(),
  data: z.record(
    z.string(),
    z.union([z.string(), z.number().finite(), z.boolean(), z.array(z.string()), z.null()]),
  ),
  notes: z.string(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  schemaVersion: z.literal(1),
  segments: z
    .array(
      z.object({ side: z.enum(['left', 'right']), start: z.number(), end: z.number().nullable() }),
    )
    .optional(),
  provenance: z
    .object({
      source: z.literal('huckleberry'),
      sourceFileName: z.string(),
      importBatchId: z.string(),
      originalRowNumber: z.number().int().positive(),
      originalValues: z.record(z.string(), z.string()),
      sourceTimezone: z.string(),
      importedAt: z.number().finite(),
      sourceFingerprint: z.string().min(1),
      parsingWarnings: z.array(z.string()),
      sourceKey: z.string().min(1),
    })
    .optional(),
  photoId: z.string().optional(),
});
export type BabyEvent = z.infer<typeof eventSchema>;
export interface TrackingSession {
  id: string;
  childId: string;
  category: Category;
  startedAt: number;
  endedAt: number | null;
  status: 'active' | 'paused' | 'completed';
  pausedIntervals: { start: number; end: number | null }[];
  metadata: Record<string, Value>;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  segments: NursingSegment[];
}
export interface Reminder {
  id: string;
  childId: string;
  name: string;
  category: Category;
  nextAt: number;
  intervalHours: number;
  enabled: boolean;
}
export interface Schedule {
  id: string;
  childId: string;
  name: string;
  wake: string;
  bed: string;
  naps: { start: string; end: string }[];
  createdAt: number;
}
export interface SleepPlan {
  id: string;
  childId: string;
  createdAt: number;
  version: number;
  intake: Record<string, string>;
  steps: { title: string; detail: string; done: boolean }[];
  notes: string;
  baseline: number | null;
  checkInDays: number;
  suggestedSchedule?: Schedule;
}
export interface CustomDefinition {
  id: string;
  name: string;
  fields: {
    name: string;
    type:
      'text' | 'number' | 'boolean' | 'single-select' | 'multi-select' | 'timestamp' | 'duration';
    options?: string[];
  }[];
}
export const uid = () => crypto.randomUUID();
export const volumeToMicro = (amount: number, unit: string) =>
  Math.round(amount * (unit === 'oz' ? 29573.5295625 : 1000));
export const microToVolume = (amount: number, unit: string) =>
  amount / (unit === 'oz' ? 29573.5295625 : 1000);
export function makeEvent(
  childId: string,
  category: Category,
  start = Date.now(),
  data: Record<string, Value> = {},
): BabyEvent {
  const now = Date.now();
  return {
    id: uid(),
    childId,
    category,
    start,
    end: null,
    data,
    notes: '',
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  };
}
