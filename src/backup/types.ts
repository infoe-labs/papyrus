import type { z } from 'zod';
import type { backupSchema } from '../lib/schemas';
export const domainTables = [
  'children',
  'events',
  'sessions',
  'settings',
  'schedules',
  'plans',
  'reminders',
  'customTrackers',
  'imports',
  'media',
] as const;
export type DomainTable = (typeof domainTables)[number];
export interface ChangeEntry {
  sequence: number;
  at: number;
  table: string;
  operation: string;
  ids: string[];
}
export type SnapshotData = Omit<
  z.infer<typeof backupSchema>,
  'format' | 'version' | 'appVersion' | 'exportedAt'
>;
export interface MediaEntry {
  id: string;
  kind: 'media' | 'child-photo';
  path: string;
  sha256: string;
  size: number;
  mime: string;
  prefix: string;
}
export interface BackupPayload extends SnapshotData {
  schemaVersion: 3;
  changeJournal: ChangeEntry[];
  mediaManifest: MediaEntry[];
}
export interface BackupEnvelope {
  format: 'babytracker-backup';
  formatVersion: 1;
  applicationVersion: string;
  backupId: string;
  createdAt: string;
  sourceDatabaseId: string;
  snapshotRevision: number;
  payloadEncoding: 'json';
  canonicalization: 'papyrus-json-v1';
  payloadHashAlgorithm: 'SHA-256';
  payloadHash: string;
  payload: BackupPayload;
}
export interface ValidatedBackup {
  envelope: BackupEnvelope;
  data: SnapshotData;
  changeJournal: ChangeEntry[];
  legacy: boolean;
  warnings: string[];
  fileHash?: string;
}
export interface BackupState {
  key: 'backup';
  currentDatabaseRevision: number;
  lastSnapshotCreatedAt?: string;
  lastExportInitiatedAt?: string;
  lastUserConfirmedSaveAt?: string;
  lastExternallyVerifiedAt?: string;
  lastVerifiedBackupRevision?: number;
  lastVerifiedBackupId?: string;
  pendingChangesSinceBackup: number;
  backupMode: 'manual' | 'external-auto';
  backupStatus:
    'not-configured' | 'up-to-date' | 'pending' | 'writing' | 'needs-permission' | 'failed';
  lastError?: string;
  reminderDays: number;
  destination?: string;
  receipts?: { backupId: string; revision: number; hash: string }[];
  generations: {
    name: string;
    backupId: string;
    revision: number;
    verifiedAt: string;
    hash?: string;
  }[];
}
export interface DatabaseMetadata {
  key: 'database';
  id: string;
  revision: number;
  frozenForRestore?: boolean;
  restoreLeaseUntil?: number;
  journalEnabled?: boolean;
  previousDatabaseName?: string;
  restoredFrom?: string;
}
export interface BackupArtifact {
  envelope: BackupEnvelope;
  blob: Blob;
  name: string;
  bytes: Uint8Array;
  type: string;
}
export interface Conflict {
  table: DomainTable;
  id: string;
  local: unknown;
  incoming: unknown;
  choice: 'local' | 'incoming';
}
export interface ExternalFile {
  kind: 'file';
  name: string;
  queryPermission: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  createWritable: () => Promise<{
    write: (data: Blob | Uint8Array) => Promise<void>;
    close: () => Promise<void>;
    abort: () => Promise<void>;
  }>;
  getFile: () => Promise<File>;
}
export interface ExternalDirectory {
  kind: 'directory';
  name: string;
  queryPermission: ExternalFile['queryPermission'];
  requestPermission: ExternalFile['requestPermission'];
  getFileHandle: (name: string, o?: { create?: boolean }) => Promise<ExternalFile>;
  removeEntry: (name: string) => Promise<void>;
}
export type ExternalDestination = ExternalFile | ExternalDirectory;
export type PickerWindow = Window & {
  showSaveFilePicker?: (o: unknown) => Promise<ExternalFile>;
  showDirectoryPicker?: (o: unknown) => Promise<ExternalDirectory>;
};
