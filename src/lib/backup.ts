// Compatibility entry point. Backup behavior lives in the dedicated subsystem.
import { createSnapshot } from '../backup/snapshot';
import { inspectBytes } from '../backup/import';
import { restoreValidated, findConflicts } from '../backup/restore';
export { domainTables as tableNames } from '../backup/types';
export const exportBackup = createSnapshot;
export async function validateBackup(input: unknown) {
  return inspectBytes(new TextEncoder().encode(JSON.stringify(input)));
}
export async function restoreBackup(input: unknown, mode: 'merge' | 'replace') {
  const backup = await validateBackup(input);
  return restoreValidated(backup, mode, mode === 'merge' ? await findConflicts(backup) : []);
}
export function download(name: string, value: unknown, type = 'application/json') {
  const data = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
