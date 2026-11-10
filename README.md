# Papyrus

An offline-first, local baby tracker and sleep-rhythm planner. React + strict TypeScript + Vite, Dexie/IndexedDB, Zustand, React Router, date-fns, Recharts, Tailwind, Lucide, Workbox, Temporal and Papa Parse. No backend, account, API key, analytics beacon, or CDN dependency.

This is a working application with persisted records, detailed forms, migration, charts, schedules and plans. **It is not yet certified against every requirement in the full build specification.** The feature matrix and release checklist explicitly track the remaining work. In particular, only the eight CSV examples in the prompt were available; the original 49-row migration fixture was not supplied and has not been fabricated.

## Run locally

```bash
npm ci
npm run dev
```

Open the URL printed by Vite. Create a child profile, then log an entry or use **Settings → Import Huckleberry CSV**. No sample records are inserted into your personal database.

```bash
npm run check       # strict TypeScript, application and tests
npm test            # Vitest, fake IndexedDB, React Testing Library
npm run build       # production assets and service worker
npm run preview     # production preview, including offline support
npm run test:e2e    # Playwright against the production build
```

Playwright uses the locally available Google Chrome on this workspace; CI installs bundled Chromium. Set `CI=true` to use bundled Chromium locally after `npx playwright install chromium`. Build before browser tests; they exercise `dist`, not the development server. Unit tests do not require internet. Development dependencies must be installed once.

## Persistence and timers

Starting a timer commits a timestamped session to IndexedDB before successful UI confirmation. Reopening rehydrates saved sessions before rendering the dashboard. An interval refreshes only the display; it does not count elapsed time. Stop/completion writes the completed event with the session ID and removes the active record atomically. Repeated completion returns the existing event. Sleep, nursing, pumping, activities and contractions use this engine. Nursing retains sequential side segments and supports both side timers. Paused periods are persisted.

Absolute timestamps preserve duration across DST and timezone changes. Unexpected device-clock changes raise an informational warning; the app cannot reconstruct the true elapsed time if the operating-system clock was wrong while the browser was closed. Review the saved start/end times in that case. Canonical sleep records remain intact across midnight; charts split them only for display. DST transitions split visual arcs at offset changes without changing elapsed totals.

Schema upgrades add indexes without clearing tables. Application caches contain code/assets only. A service-worker update does not delete IndexedDB records.

## Migrating Huckleberry data

Use Settings → Import Huckleberry CSV. The wizard processes the nine-column export on your device, confirms the destination child and IANA source timezone, previews each parsed row, identifies exact and potential duplicates, requires review of ambiguous/discrepant rows, commits in a transaction, and offers a downloadable audit.

Sleep, breast/bottle feeds, pumping and diapers have distinct parsers. Nursing side totals remain independent of overall duration; unknown sequences are not invented. Pumping with no end is historical with unknown duration. Missing diaper details stay unknown. All original columns, notes, source timezone, warnings, import batch, and a SHA-256 source fingerprint remain attached to imported records and survive edits.

Timezone-free times are interpreted in the confirmed source timezone, never accidentally as UTC. Ambiguous/nonexistent DST times are rejected by default; explicitly choosing an earlier/later interpretation flags affected rows. Missing sleep ends can be inferred only with the user-selected option and row disclosure. Unknown categories can be retained as generic records, mapped through a known parser, or explicitly skipped. The audit accounts for every source row.

Identical reimports skip existing source fingerprints, including records subsequently edited by a parent. Potential corrected exports enter review and never silently overwrite records. Reviewed modifications can be kept alongside existing records and reconciled in History. Explicit duplicate import is available. No automatic reconciliation overwrites a manual edit.

`tests/fixtures/huckleberry-synthetic.csv` contains **eight synthetic-date examples matching the supplied format and numerical regression cases**. It is not the missing 49-row fixture. The browser acceptance workflow checks actual stored values, rings, actogram, history, persistent timers, backup/restore and duplicate protection, online and offline at desktop/mobile viewport sizes.

## Backup and restore

Use **Settings → Data Safety → Back Up Now**. Save the dated file outside browser storage. Ordinary backups are validated JSON; backups containing photos use a checksummed ZIP archive. Optional password encryption is available. A download initiation is not proof that a file was saved: the UI separately records your confirmation and external-file verification.

**Test Backup** verifies an external file and stages a complete test restore without changing your live records. Restore offers preview, merge with conflict review, or explicitly confirmed replacement. Candidates are validated in a separate database before cutover; the existing database is retained as a safety point. Recovered unfinished timers require review.

Where folder access is supported, authorize a destination for rotating backups while the app is open. New dated files are read back and verified before older generations are retired; at least three verified generations are retained when available. A single-file destination is never continuously overwritten. Manual export works on iOS and Android without these APIs.

Browser storage is **not guaranteed permanent**. Keep external backups and test them regularly. See [the recovery guide](docs/BACKUP.md) for platform workflows, integrity format, failure handling, encryption and limits. All core backup and restore operations work offline while application assets remain available.

## Offline installation on iPhone

1. Open the deployed HTTPS site in Safari while online.
2. Create a profile and wait for “Ready for offline.”
3. Use Share → Add to Home Screen → Add.
4. Open the installed app, then test it in airplane mode.

The initial visit and successful precache need internet. All core application screens, forms, charts, reference tables, parsing and backups work from cached assets afterward. Photos and logs live in IndexedDB. Safari and operating-system behavior can still evict storage; make backups. First test sensitive lifecycle behavior on your actual iPhone using `docs/IOS-CHECKLIST.md`.

Reminders remain available in the app. Browser notifications require support and permission and are checked while the app is open. There is no server/native scheduler, so precise closed-app delivery, particularly on iOS, is not promised. The app has no cloud speech or photo interpretation dependency.

## GitHub Pages

The repository workflow checks TypeScript/unit/browser tests and deploys static assets from `main`. In GitHub repository **Settings → Pages**, select **GitHub Actions**. The workflow sets `VITE_BASE_PATH=/papyrus/`; hash routing avoids server rewrite requirements. For a differently named repository or a custom-domain root, adjust that variable.

Manual subpath build:

```bash
VITE_BASE_PATH=/papyrus/ npm run build
TEST_BASE_PATH=/papyrus/ npm run test:e2e
```

Live application: **https://infoe-labs.github.io/papyrus/**. GitHub Pages is enabled, and the workflow deploys after its checks pass. The public HTTPS origin has been checked for service-worker control and offline timer persistence.

Updates download in the background and present an update prompt. Accept when ready. User records and timers are already persistent; updates replace code caches only. Refresh the deployed app online once to receive a new version.

## Data and guidance

Volumes use integer microliters, with US fluid-ounce conversion at input boundaries. Bottle reports aggregate consumed volume and separate breast milk/formula; pumping is separate. Temperature is stored in °C, growth in kg/cm. Mixed diapers count once as a change and toward both wet and stool counts. Completed-duration reports exclude active sessions; provisional live arcs are marked. Missing sleep logs are not described as zero actual sleep.

WHO LMS data, original source hashes, supported ranges and methods are documented in [docs/REFERENCES.md](docs/REFERENCES.md) and [docs/GROWTH-SOURCES.json](docs/GROWTH-SOURCES.json). Sleep suggestions use original transparent local heuristics and observations, not a proprietary commercial algorithm. Plans and charts are informational, not diagnosis or clinical assessment.

## Project map and release status

- [Architecture, persistence design, screens, dependencies and test strategy](docs/ARCHITECTURE.md)
- [Feature-completeness matrix](docs/FEATURES.md)
- [Remaining acceptance work](docs/REMAINING.md)
- [Manual iOS checklist](docs/IOS-CHECKLIST.md)

Known dependency audit notices in this toolchain concern build-time transitive packages (Workbox/glob/minimatch/deepmerge); no production dependency advisories were reported in the recorded audit. Do not override major transitive versions without verifying service-worker generation and offline browser tests.
