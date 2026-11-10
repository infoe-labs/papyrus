import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Shield, FolderOpen, Upload, Check, FileCheck2 } from 'lucide-react';
import { db } from '../../lib/db';
import { createBackupArtifact } from '../export';
import { initiateDownload } from '../adapters/downloadAdapter';
import { canShare, initiateShare } from '../adapters/shareAdapter';
import { saveDestination, writeFirstFile } from '../adapters/fileSystemAccessAdapter';
import { updateBackupState } from '../backupStatus';
import { runAutomaticBackup } from '../automatic';
import { recoverPreviousDataset } from '../restore';
import type { BackupArtifact, PickerWindow, ExternalDestination } from '../types';
import { BackupHealthCard } from './BackupHealthCard';
import { RestoreWizard } from './RestoreWizard';
export function BackupSettings({ compact = false }: { compact?: boolean }) {
  const [wizard, setWizard] = useState<'restore' | 'test'>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [artifact, setArtifact] = useState<BackupArtifact>();
  const [initiated, setInitiated] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [encryption, setEncryption] = useState(false);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const destination = useLiveQuery(() => db.externalHandles.get('destination'), []);
  const metadata = useLiveQuery(() => db.metadata.get('database'), []);
  const picker = window as PickerWindow;
  async function perform(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(String(e));
      await updateBackupState({
        backupStatus:
          e instanceof DOMException && e.name === 'NotAllowedError' ? 'needs-permission' : 'failed',
        lastError: String(e),
      }).catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function prepare(emergency = false) {
    if (!emergency && encryption && password !== repeat)
      throw Error('The backup passwords do not match.');
    const ready = await createBackupArtifact(!emergency && encryption ? password : undefined);
    setArtifact(ready);
    setPassword('');
    setRepeat('');
    setConfirmed(false);
    await initiateDownload(ready);
    setInitiated(true);
  }
  function connect() {
    // The picker is called before any awaited work, directly from the user gesture.
    let selection: Promise<ExternalDestination>;
    let prepared: BackupArtifact | undefined;
    try {
      if (picker.showDirectoryPicker)
        selection = picker.showDirectoryPicker({ mode: 'readwrite', id: 'papyrus-backups' });
      else if (picker.showSaveFilePicker) {
        if (!artifact)
          throw Error(
            'Prepare a file with Back Up Now first, then choose an external destination.',
          );
        if (artifact.name.includes('.encrypted.'))
          throw Error(
            'Use download/share and Test Backup for encrypted files. Filesystem read-back requires an ordinary backup.',
          );
        prepared = artifact;
        selection = picker.showSaveFilePicker({
          suggestedName: artifact.name,
          types: [
            {
              description: 'Papyrus backup',
              accept:
                artifact.type === 'application/zip'
                  ? { 'application/zip': ['.zip'] }
                  : { 'application/json': ['.json'] },
            },
          ],
        });
      } else throw Error('This browser supports manual download/share only. Use Back Up Now.');
    } catch (e) {
      setError(String(e));
      return;
    }
    void perform(async () => {
      const handle = await selection;
      await updateBackupState({
        backupStatus: 'writing',
        lastExportInitiatedAt: new Date().toISOString(),
      });
      const ready = prepared ?? (await createBackupArtifact());
      await writeFirstFile(handle, ready);
      if (handle.kind === 'directory') await saveDestination(handle);
      else await db.externalHandles.put({ key: 'destination', handle });
    });
  }
  return (
    <section className="card backup-settings">
      <div className="card-heading">
        <div>
          <p className="eyebrow">A LITTLE PEACE OF MIND</p>
          <h2>{compact ? 'Bring your memories home' : 'Data Safety'}</h2>
        </div>
        <Shield size={22} />
      </div>
      {!compact && (
        <>
          <p className="muted">
            Keep recoverable copies outside this browser. A snapshot or internal journal alone
            cannot survive site-data deletion.
          </p>
          <BackupHealthCard />
          <div className="divider" />
          <label className="check-label">
            <input
              type="checkbox"
              checked={encryption}
              onChange={(e) => setEncryption(e.target.checked)}
            />
            Encrypt this manual backup with a password
          </label>
          {encryption && (
            <>
              <div className="form-grid">
                <label>
                  Backup password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label>
                  Repeat password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                  />
                </label>
              </div>
              <p className="warning-text small">
                At least 10 characters. This password is never stored. If forgotten, it cannot be
                recovered. Ordinary backups are readable by anyone who has the file.
              </p>
            </>
          )}
          <div className="backup-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => void perform(() => prepare())}
            >
              <Download size={16} />
              Back Up Now
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void perform(() => prepare(true))}
            >
              Download Emergency Backup
            </button>
          </div>
          {artifact && (
            <div className="backup-export-status">
              <p>
                <Check size={15} />
                Snapshot created and validated · revision {artifact.envelope.snapshotRevision}
              </p>
              <p>
                {initiated
                  ? 'Export initiated. External save is not independently verified.'
                  : 'Ready to export.'}
              </p>
              <div className="backup-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await initiateDownload(artifact);
                      setInitiated(true);
                    })
                  }
                >
                  Download prepared file
                </button>
                {canShare(artifact) && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        await initiateShare(artifact);
                        setInitiated(true);
                      })
                    }
                  >
                    Share to Files
                  </button>
                )}
              </div>
              {initiated && !confirmed && (
                <div className="save-confirmation">
                  <h3>Was the backup saved in Files?</h3>
                  <p className="muted small">
                    Save outside the app, such as Files, Downloads, iCloud Drive, or a folder you
                    control.
                  </p>
                  <div className="backup-actions">
                    <button
                      className="button"
                      onClick={() =>
                        void perform(async () => {
                          await updateBackupState({
                            lastUserConfirmedSaveAt: new Date().toISOString(),
                          });
                          setConfirmed(true);
                        })
                      }
                    >
                      I saved it
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => void perform(() => initiateDownload(artifact))}
                    >
                      Try again
                    </button>
                    <button className="text-button" onClick={() => setInitiated(false)}>
                      Not now
                    </button>
                  </div>
                </div>
              )}
              {confirmed && (
                <p className="info">
                  You confirmed saving the file. This is self-reported, not filesystem verification.
                  Use Test Backup to select and independently validate it.
                </p>
              )}
            </div>
          )}
        </>
      )}
      <div className="backup-actions">
        <button className="button secondary" disabled={busy} onClick={() => setWizard('restore')}>
          <Upload size={16} />
          Restore from Backup
        </button>
        <button className="button secondary" disabled={busy} onClick={() => setWizard('test')}>
          <FileCheck2 size={16} />
          Test Backup
        </button>
      </div>
      {!compact && (
        <>
          <div className="divider" />
          <h3>Verified generations, not one overwritten file</h3>
          <p className="muted small">
            When supported, authorize a folder. While Papyrus is open, changes are debounced for 60
            seconds, written to a new dated file, read back, and checked. At least three verified
            generations are retained once created. Never rely on closed-app scheduling.
          </p>
          <button className="button secondary" disabled={busy} onClick={connect}>
            <FolderOpen size={17} />
            {picker.showDirectoryPicker
              ? 'Enable Automatic Local Backups'
              : picker.showSaveFilePicker
                ? 'Save one verified external file'
                : 'Manage Automatic Backups'}
          </button>
          {!picker.showDirectoryPicker && (
            <p className="muted small">
              Rotating folder access is unavailable here. Manual download/share remains supported. A
              single authorized file is never continuously overwritten.
            </p>
          )}
          {destination && (
            <div className="backup-actions">
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  const permission = destination.handle.requestPermission({ mode: 'readwrite' });
                  void perform(async () => {
                    if ((await permission) !== 'granted')
                      throw Error('Folder permission was not granted.');
                    if (destination.handle.kind !== 'directory')
                      throw Error('Choose a new folder for safe rotating backups.');
                    await saveDestination(destination.handle);
                    await runAutomaticBackup();
                  });
                }}
              >
                Reconnect destination
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void perform(() => runAutomaticBackup())}
              >
                Back up pending changes
              </button>
              <button
                className="text-button"
                onClick={() =>
                  void perform(async () => {
                    await db.externalHandles.delete('destination');
                    await updateBackupState({
                      backupMode: 'manual',
                      backupStatus: 'not-configured',
                      destination: undefined,
                    });
                  })
                }
              >
                Disconnect automatic backups
              </button>
            </div>
          )}
          {metadata?.previousDatabaseName && (
            <div className="restore-preview">
              <h3>Internal pre-restore recovery point</h3>
              <p className="muted small">
                The previous database was retained before switching datasets. This copy is inside
                browser storage and cannot survive site-data deletion.
              </p>
              <button
                className="button secondary"
                onClick={() => {
                  if (
                    confirm(
                      'Switch back to the retained pre-restore dataset? The current dataset will also be retained.',
                    )
                  )
                    void perform(() => recoverPreviousDataset());
                }}
              >
                Recover previous dataset
              </button>
            </div>
          )}
        </>
      )}
      {busy && (
        <p role="status" className="muted small">
          Working locally. No success is reported until the relevant check finishes…
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {wizard && (
        <RestoreWizard testOnly={wizard === 'test'} onClose={() => setWizard(undefined)} />
      )}
    </section>
  );
}
