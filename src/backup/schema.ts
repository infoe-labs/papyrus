import { z } from 'zod';
import { backupSchema } from '../lib/schemas';
export const journalSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    at: z.number().finite(),
    table: z.string(),
    operation: z.string(),
    ids: z.array(z.string()),
  })
  .strict();
export const mediaSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['media', 'child-photo']),
    path: z.string().regex(/^media\/[a-f0-9]{64}\.bin$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size: z
      .number()
      .int()
      .min(0)
      .max(16 * 1024 * 1024),
    mime: z.string().max(100),
    prefix: z.string().max(200),
  })
  .strict();
export const payloadSchema = backupSchema
  .omit({ format: true, version: true, appVersion: true, exportedAt: true })
  .extend({
    schemaVersion: z.literal(3),
    changeJournal: z.array(journalSchema).max(500000),
    mediaManifest: z.array(mediaSchema).max(10000),
  })
  .strict();
export const envelopeSchema = z
  .object({
    format: z.literal('babytracker-backup'),
    formatVersion: z.literal(1),
    applicationVersion: z.string().max(100),
    backupId: z.string().uuid(),
    createdAt: z.string().datetime(),
    sourceDatabaseId: z.string().uuid(),
    snapshotRevision: z.number().int().nonnegative(),
    payloadEncoding: z.literal('json'),
    canonicalization: z.literal('papyrus-json-v1'),
    payloadHashAlgorithm: z.literal('SHA-256'),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    payload: payloadSchema,
  })
  .strict();
export const LIMITS = {
  fileBytes: 64 * 1024 * 1024,
  uncompressedBytes: 96 * 1024 * 1024,
  records: 300000,
  mediaCount: 10000,
};
