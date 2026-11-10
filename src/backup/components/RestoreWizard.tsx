import { useState } from 'react';
import { X, ShieldCheck, Upload, Check, ArrowRight } from 'lucide-react';
import { useDialog } from '../../lib/useDialog';
import { inspectFile } from '../import';
import { testRestore, restoreValidated, findConflicts } from '../restore';
import { externallyVerified } from '../backupStatus';
import type { ValidatedBackup, Conflict } from '../types';
import { RestorePreview } from './RestorePreview';
import { RestoreConflictDialog } from './RestoreConflictDialog';
export function RestoreWizard({
  onClose,
  testOnly = false,
}: {
  onClose: () => void;
  testOnly?: boolean;
}) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File>();
  const [password, setPassword] = useState('');
  const [backup, setBackup] = useState<ValidatedBackup>();
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'replace' | 'merge' | 'preview'>('replace');
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [checked, setChecked] = useState(false);
  const [tested, setTested] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState('');
  const ref = useDialog(() => {
    if (!busy) onClose();
  });
  async function inspect() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const valid = await inspectFile(file, password || undefined);
      setBackup(valid);
      setStep(2);
    } catch (e) {
      setError(String(e));
    } finally {
      setPassword('');
      setBusy(false);
    }
  }
  async function verifyStaging() {
    if (!backup) return;
    setBusy(true);
    setError('');
    try {
      await testRestore(backup, setProgress);
      setTested(true);
      if (!backup.legacy) await externallyVerified(backup.envelope);
      setStep(4);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-shade">
      <section
        className="modal import-modal"
        role="dialog"
        ref={ref}
        aria-modal="true"
        aria-labelledby="restore-title"
      >
        <header className="modal-header">
          <span className="tile-icon growth">
            <ShieldCheck />
          </span>
          <div>
            <p className="eyebrow">A RECOVERABLE LITTLE WORLD</p>
            <h2 id="restore-title">{testOnly ? 'Test Backup' : 'Restore from Backup'}</h2>
          </div>
          <button
            className="icon-button close"
            aria-label="Close restore"
            disabled={busy}
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <ol className="wizard-steps">
          {['Select', 'Inspect', 'Validate', 'Preview', 'Choose', 'Verify'].map((label, i) => (
            <li className={step >= i + 1 ? 'current' : ''} key={label}>
              <span>{i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <div className="modal-body">
          {step === 1 && (
            <>
              <div className="drop-zone">
                <Upload size={30} />
                <h3>A backup from somewhere safe.</h3>
                <label>
                  Select external backup
                  <input
                    type="file"
                    accept=".json,.zip,application/json,application/zip"
                    aria-label="Select external backup"
                    onChange={(e) => {
                      setFile(e.target.files?.[0]);
                      setError('');
                    }}
                  />
                </label>
                <p>
                  Choose from Files or Downloads. JSON and Papyrus media ZIP archives up to 64 MB
                  are supported.
                </p>
              </div>
              <label>
                Backup password · only if encrypted
                <input
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <p className="muted small">
                Everything is inspected on this device. No file is uploaded. Forgotten encryption
                passwords cannot be recovered.
              </p>
            </>
          )}
          {backup && step >= 2 && step <= 5 && <RestorePreview backup={backup} />}{' '}
          {step === 3 && (
            <div>
              <h3>Integrity and schema checked</h3>
              <ul className="backup-validation-list">
                <li>
                  <Check size={14} />
                  {backup?.legacy
                    ? 'Legacy schema only; original checksum unavailable'
                    : 'SHA-256 checksum matches canonical payload'}
                </li>
                <li>
                  <Check size={14} />
                  Required collections, IDs, types and relationships
                </li>
                <li>
                  <Check size={14} />
                  Timestamp bounds, durations and source provenance
                </li>
                <li>
                  <Check size={14} />
                  Attachments verified when present
                </li>
              </ul>
              <p className="muted small">
                Next, create and check an isolated staging database. Your live records stay in
                place.
              </p>
            </div>
          )}
          {step === 4 && (
            <p className="info">
              Test restore passed. Staged record counts, values and relationships match. Your live
              tracking dataset has not been replaced.
            </p>
          )}
          {step === 5 && !testOnly && (
            <>
              <label>
                Restore mode
                <select
                  aria-label="Restore mode"
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as typeof mode);
                    setChecked(false);
                  }}
                >
                  <option value="replace">Replace entire dataset · disaster recovery</option>
                  <option value="merge">Merge · review conflicts, skip exact duplicates</option>
                  <option value="preview">Preview only · leave live data unchanged</option>
                </select>
              </label>
              {mode === 'merge' && (
                <RestoreConflictDialog conflicts={conflicts} onChange={setConflicts} />
              )}
              <p className="info">
                A complete staged database is verified before switching. The current database is
                retained as an internal recovery point. It is not a substitute for an external
                backup.
              </p>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                />
                I reviewed this backup and confirm{' '}
                {mode === 'replace'
                  ? 'replacing my active dataset'
                  : mode === 'merge'
                    ? 'the merge choices'
                    : 'preview only'}
                .
              </label>
            </>
          )}
          {step === 6 && (
            <div className="empty-state">
              <ShieldCheck size={30} />
              <h3>{busy ? 'Staging and verifying…' : result || 'Backup test passed'}</h3>
              <progress max="100" value={progress} />
              <p>
                {busy
                  ? 'Existing data remains intact until the verified cutover.'
                  : 'Your live dataset was not replaced.'}
              </p>
            </div>
          )}
          {busy && step !== 6 && (
            <p className="muted small">
              {step === 3 ? `Testing a staged copy… ${progress}%` : 'Reading and checking locally…'}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="modal-footer">
          {step > 1 && step < 6 && (
            <button className="button secondary" disabled={busy} onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {step === 1 && (
            <button className="button" disabled={!file || busy} onClick={() => void inspect()}>
              Inspect file <ArrowRight size={15} />
            </button>
          )}
          {step === 2 && (
            <button className="button" onClick={() => setStep(3)}>
              Review validation <ArrowRight size={15} />
            </button>
          )}
          {step === 3 && (
            <button className="button" disabled={busy} onClick={() => void verifyStaging()}>
              Test restore in isolation
            </button>
          )}
          {step === 4 && (
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                if (testOnly) {
                  setResult('Backup test passed · live data unchanged');
                  setStep(6);
                  return;
                }
                setBusy(true);
                try {
                  setConflicts(await findConflicts(backup!));
                  setStep(5);
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {testOnly ? 'Finish test' : 'Choose restore mode'}
            </button>
          )}
          {step === 5 && (
            <button
              className="button"
              disabled={!checked || !tested || busy}
              onClick={async () => {
                if (!backup) return;
                if (mode === 'preview') {
                  setResult('Preview complete · live data unchanged');
                  setStep(6);
                  return;
                }
                setBusy(true);
                setStep(6);
                try {
                  await restoreValidated(backup, mode, conflicts, setProgress);
                  setResult('Restore verified and activated.');
                } catch (e) {
                  setError(String(e));
                  setStep(5);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirm {mode === 'replace' ? 'replacement' : mode === 'merge' ? 'merge' : 'preview'}
            </button>
          )}
          {step === 6 && !busy && (
            <button className="button" onClick={onClose}>
              Done
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
