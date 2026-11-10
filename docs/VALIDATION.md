# Recorded validation — 2026-11-09

Executed in the supplied Linux workspace (Node 22, local Google Chrome/Chromium, desktop and iPhone 13 viewport profiles).

- Strict TypeScript: `npm run check` — passed.
- Vitest/React Testing Library: `npm test` — 111 passing tests across six files.
- Production Vite + Workbox build: `npm run build` — passed; 21 assets precached, approximately 1.43 MB uncompressed.
- Root production browser suite: `npm run test:e2e` — 13 passed, 1 intentionally skipped (duplicate mobile execution of the desktop persistent-browser-process restart test).
- `/papyrus/` build and browser suite: `VITE_BASE_PATH=/papyrus/ npm run build`, then `TEST_BASE_PATH=/papyrus/ npm run test:e2e` — 13 passed, same intentional skip. Both suites include offline disaster recovery and measured light/dark contrast checks.
- Production dependency audit: `npm audit --omit=dev` — zero known advisories at execution time.
- Synthetic range aggregation regression: 30,660 explicitly generated test events over 365 days; counts, milk, output and mixed-diaper totals checked, with a 5-second host-side upper bound. This is not a phone performance guarantee.

## What browser tests actually establish

An empty database is created in each isolated context. The eight synthetic-date CSV examples are imported through the real worker-based wizard. Tests assert stored category counts, exact microliter volumes, side totals, overnight duration, visible rings and actogram segments, daily feed, zero duplicate additions on repeated import, backup download and restoration, reports/planner/history navigation, and absence of uncaught page errors. The workflow is repeated with network access disabled after precaching, at desktop and mobile viewport sizes.

The separate persistent-profile test closes the entire Chromium process with an active sleep session, reopens the same browser profile with networking disabled, confirms the timer, and completes it once. Native form coverage creates a historical record with notes in all 14 categories, exercises editing and confirmed deletion with undo. Repository parameterized tests cover creation/editing/backdating/notes/deletion for every category. Form tests cover independent diaper amounts, milk conversions, pounds/ounces, preserved provenance, and all custom field types.

Timer unit tests cover timestamp elapsed time, pauses/resume, category/child conflicts, sequential sides, idempotent completion, start correction, cancellation, DST elapsed duration, midnight, a failed write retaining the active record, schema index upgrade, suspicious clock changes, and corrected completed durations. Import tests include raw-row preservation, unknown types, corrupted timestamps, quoted/multiline notes, BOM/CRLF, missing-end inference disclosure, duration disagreement, exact/candidate duplicates, DST ambiguity/nonexistence, and a 1,500-row generated file.

## Limits of this evidence

The original 49-row fixture is unavailable, so the required 49-row acceptance demo remains unexecuted. No synthetic replacement is described as the original dataset. Chromium with a mobile viewport is not physical iPhone/Safari validation. The physical iOS/Android, full accessibility, longitudinal prediction, reconciliation and other remaining checks are in `REMAINING.md` and `IOS-CHECKLIST.md`. GitHub Pages is enabled and the initial public deployment passed an HTTPS-origin service-worker/offline timer check. The 0.2 update is deployed through the same verified workflow.

## Backup and UI regression coverage (0.2)

Unit tests cover every snapshot collection, consistent revisions, corruption, malformed/future schemas, duplicate IDs, child references, Unicode/Vietnamese notes, exact media archive recovery, malicious archive paths, encrypted round trips and wrong passwords, unchanged-data test restore, full-loss recovery, repeated restore, conflict preservation, active timer review, staging/quota/pointer failures, concurrent writes and expired cutover recovery. A 10,000-record staging case verifies count and values. External adapter tests use simulated file handles for three-generation rotation, write/read failures, revoked permission, deleted files, single-file overwrite refusal and substantial record-count-drop protection.

The browser disaster-recovery test downloads an actual file, distinguishes user save confirmation from independent verification, stages a test without changing records, clears IndexedDB and localStorage, goes offline, restores via empty-database onboarding and compares the original records/notes/quantities/profiles. Recovered timers require an actual end or explicit continuation. Repeated merge does not resurrect completed timers. The same checks run at desktop and mobile sizes and both deployment base paths.

Contrast assertions require heading contrast above 7:1 and sampled secondary/metric text at least 4.5:1 in light and dark modes, plus zero horizontal overflow against actual client width. These checks do not constitute a complete accessibility audit. Native iOS/Android file-provider and suspension tests remain pending hardware access.
