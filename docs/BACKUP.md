# Backup and disaster recovery

Papyrus 0.2 stores live records in IndexedDB. Browser storage can be cleared or evicted; only a retained external file protects against complete site-data loss. Nothing is uploaded.

## Save and test a backup

1. In Settings → Data Safety, press **Back Up Now**. The app creates and validates a consistent snapshot, then offers download or supported native sharing.
2. Save the file outside website storage, for example through iPhone Files, Android Downloads or a desktop folder. Keep several dated generations.
3. Answer “Was the backup saved in Files?” accurately. “I saved it” records your confirmation, not independent filesystem evidence.
4. Press **Test Backup**, select the retained external file and complete validation. The app checks integrity and stages a complete restore in an isolated database, checks counts and relationships, then removes that test database. Your live records and active database pointer remain unchanged.

The health panel distinguishes snapshot creation, export initiation, user-confirmed save and verified external file selection/read-back. A verified file from another database is not evidence that current pending changes were protected. Verification is evidence at the time checked, not a guarantee that a file remains available forever.

## Rotating external backups

When `showDirectoryPicker` is available, use Manage Automatic Backups to authorize a folder through a direct user gesture. Capabilities are detected at runtime, regardless of device brand. While the app is open, mutations debounce for 60 seconds; foreground return and significant imports also prompt a pending write. Permissions may need reconnection.

Each write creates a new unique dated file, closes it, reads it back and validates its checksum and identity. Existing files are never overwritten. Previously recorded generations are checked again before being counted. Only after a replacement is verified does rotation retain the newest three verified files and remove eligible older verified generations. Missing or altered files are neither counted nor deleted. A substantial drop in event count pauses rotation to preserve prior recovery points for review. Keep additional manual generations for longer retention.

If only a save-file picker is available, a new empty file can be verified once; it is never continuously overwritten. Safe automatic rotation requires a folder. Unsupported APIs fall back to ordinary downloads. No backups are promised while the app is closed. Backup errors remain visible, and normal tracking remains available.

## Restore

Select Restore Backup, inspect the file, validate it, review counts and choose preview, merge or replacement. Explicit confirmation is required before applying data. Merge defaults to keeping local conflicting edits; IDs prevent repeated restores from duplicating records. Existing completed events prevent old unfinished sessions with the same ID from being resurrected.

The candidate is written in batches to a separate IndexedDB database and read back for validation. The current database remains intact. At cutover the app checks its revision again, briefly freezes writes and atomically changes the active-database pointer. Concurrent tracking changes cause the restore to abort rather than lose those changes. The previous database remains available as a safety recovery point. Failed staging or pointer changes preserve the original dataset. A short freeze lease recovers an interrupted cutover on startup.

Unfinished timers are restored as **recovered sessions requiring review**. Continue from the original start, set an actual end or discard them. The restore time is never silently used as a confirmed end time. Reports and predictions derive again from canonical restored records.

## Portable protocol and validation

The `babytracker-backup` version-1 JSON envelope identifies application/schema versions, source database UUID, snapshot revision and SHA-256 of the complete canonical payload. A read transaction snapshots all domain tables plus revision and optional change journal. Hashing and serialization occur after the transaction, so new tracking writes remain available.

`papyrus-json-v1` canonicalization sorts own object keys by UTF-16 code-unit order, keeps array order, serializes strings/booleans/null/finite numbers with JSON.stringify, rejects sparse arrays and non-JSON values, and limits nesting to 64. Unicode is preserved without normalization. SHA-256 covers the resulting UTF-8 bytes. The checksum detects corruption; it does not authenticate the creator of a maliciously altered and rehashed file.

Zod reuses the application's domain schemas. Validation checks format/version, required collections, unique IDs, references, timestamps, enums, quantities, durations, local media and unsupported fields before writes. Limits: 64 MB input, 96 MB uncompressed archive, 300,000 records, 10,000 attachments and 16 MB per attachment. Oversized exports fail visibly; use a device with sufficient memory rather than assuming unlimited capacity.

Records, IDs, null/unknown fields, notes, provenance, original CSV values, settings, children, plans, reminders, schedules and active sessions are preserved. Photos use a separately versioned stored ZIP archive with a manifest, per-file checksums and restricted paths. Only this app's uncompressed ZIP format is accepted, avoiding decompression bombs. File handles and device-specific backup destinations are intentionally excluded from portable payloads; reconnect after restore. Legacy 0.1 JSON can be migrated with a clear warning that the original had no integrity checksum.

Optional encrypted exports use AES-256-GCM with random salt/nonce and PBKDF2-SHA-256 (600,000 iterations). Metadata is authenticated. Passwords are never stored; forgotten passwords cannot be recovered. Ordinary unencrypted files are readable by anyone who can access them. Rotation and test restore are available without encryption.

An optional append-only journal records ordered mutations and stable IDs and is included in backups. It is an audit trail, not a complete inverse-operation log. Its local copy does not protect against origin deletion.

## Device acceptance

Automated Chromium tests perform external download, isolated test restore, complete IndexedDB/localStorage loss, offline restoration, exact record comparisons and unfinished-timer review at desktop/mobile viewport sizes. File API unit tests simulate permissions, write/read failures and rotation. These are not physical-device certification.

On an actual iPhone: install, create records, export to Files, test that file, enable airplane mode, clear site data, reload cached application code (or reconnect once if assets were removed), restore through Files, review active timers and verify every record. Test native sharing and large text.

On an actual Android device: repeat manual recovery, then check runtime folder-picker availability. If supported, authorize a folder, make several changes, confirm three independently readable generations, revoke permission, verify an attention status, reconnect and repeat after site-data reset. Retained external files must remain selectable even if saved handles were lost.

Actual iOS/Android hardware tests remain pending. See [remaining work](REMAINING.md) and [iOS checklist](IOS-CHECKLIST.md).
