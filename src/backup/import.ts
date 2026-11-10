import { backupSchema } from '../lib/schemas';
import { validateData, validateEnvelope } from './validate';
import { payloadHash, sha256 } from './checksum';
import { inspectArchive } from './media';
import { decryptBackup } from './encryption';
import { LIMITS } from './schema';
import type { ValidatedBackup, BackupEnvelope } from './types';
export async function inspectBytes(bytes: Uint8Array, password?: string): Promise<ValidatedBackup> {
  if (bytes.length > LIMITS.fileBytes)
    throw Error('Backup exceeds 64 MB. Use a smaller recovery archive or desktop support.');
  if (bytes[0] === 80 && bytes[1] === 75)
    return { ...(await inspectArchive(bytes)), fileHash: await sha256(bytes) };
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw Error('This file is not valid UTF-8 JSON or a supported backup archive.');
  }
  if ((input as { format?: string })?.format === 'papyrus-encrypted-backup') {
    if (!password) throw Error('This backup needs its password.');
    const plain = await decryptBackup(input, password);
    return { ...(await inspectBytes(plain.bytes)), fileHash: await sha256(bytes) };
  }
  if ((input as { format?: string })?.format === 'papyrus') {
    const old = backupSchema.parse(input);
    const { format: _format, version: _version, appVersion, exportedAt, ...raw } = old;
    const data = validateData(raw);
    const payload = { ...data, schemaVersion: 3 as const, changeJournal: [], mediaManifest: [] };
    const envelope: BackupEnvelope = {
      format: 'babytracker-backup',
      formatVersion: 1,
      applicationVersion: appVersion,
      backupId: crypto.randomUUID(),
      createdAt: new Date(exportedAt).toISOString(),
      sourceDatabaseId: crypto.randomUUID(),
      snapshotRevision: 0,
      payloadEncoding: 'json',
      canonicalization: 'papyrus-json-v1',
      payloadHashAlgorithm: 'SHA-256',
      payloadHash: await payloadHash(payload),
      payload,
    };
    return {
      envelope,
      data,
      changeJournal: [],
      legacy: true,
      warnings: [
        'Legacy backup: no original checksum exists. Schema checked only; original file integrity cannot be independently established.',
      ],
      fileHash: await sha256(bytes),
    };
  }
  return { ...(await validateEnvelope(input)), fileHash: await sha256(bytes) };
}
export async function inspectFile(file: File, password?: string) {
  if (file.size > LIMITS.fileBytes) throw Error('Backup exceeds the 64 MB file limit.');
  if (!/\.(json|zip)$/i.test(file.name))
    throw Error('Select a JSON backup or Papyrus media ZIP archive.');
  return inspectBytes(new Uint8Array(await file.arrayBuffer()), password);
}
