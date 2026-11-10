# Papyrus architecture and implementation plan

## Repository inspection

Empty Git repository at the start of implementation. No application, existing records, or original 49-row CSV fixture was present. Eight format examples are represented by a synthetic-date regression fixture; original export timestamps are not published. Synthetic test data must be explicitly labeled.

## Typed domain and persistence

One indexed `events` table is the canonical source for typed event variants. Separate `sessions` stores timestamp-based active timers; completion moves data into events in one transaction using the session UUID (idempotent). `children`, `settings`, `schedules`, `plans`, `reminders`, `customTrackers`, `imports`, and `media` store other entities. Canonical volumes use integer microliters (1 US fl oz = 29,573.5295625 µL); weight kg, length cm, temperature °C. No derived totals are persisted. Event type discriminates metadata validated at repository boundaries. Imports retain raw source rows and warnings. Dexie schema versions are additive.

## Screen map

Home: Today / Sleep / Feeding / Growth / Trends, active sessions, quick actions, rings, actogram, linked date selection, daily feed.
History: date, filters, search, details, edit/delete/duplicate.
Reports: range selection, charts, CSV, print.
Sleep Planner: editable saved schedules, adaptive predictions, intake and versioned rules-based plans.
Settings: children, units, theme, panels, reminders, custom trackers, CSV import wizard, full backup/restore, storage and version.

## Dependencies and phases

1. Foundation: build/tooling → typed domain → validated IndexedDB → timer transactions → shell and PWA.
2. Migration early: timezone conversion → event-specific registry → preview/review → fingerprints → transactional commit/audit. No importer row may vanish.
3. Tracking: declarative field schema → detailed native forms for every category → CRUD and timer/nursing segments.
4. Analytics: interval clipping and union → daily selectors → history → rings/actogram/timeline → category charts.
5. Prediction and planning: robust historical windows → confidence/explanations → editable schedules → saved plan versions and insights.
6. Convenience: deterministic text drafts → confirmation → reminders and custom definitions.
7. Hardening: validated backups/media → persistence/storage checks → accessibility → tests → static subpath deployment.

## Test strategy

Vitest: timer rehydration/idempotence/pause/edit/DST/midnight/conflicts/failure; conversions and aggregation; parser type mappings/raw row preservation/timezone DST/idempotence/large/corrupt CSV; deterministic prediction and growth reference checks; backup validation/rollback.
React Testing Library: conditional diaper fields and persisted form edits.
Playwright against production build: empty DB → CSV import → values/charts → timer start/reload/end → backup → repeat import → offline navigation and recovery at desktop/mobile sizes. Original 49-row acceptance demo remains pending until supplied.
Manual iOS: install, airplane mode, terminate, suspend overnight, reboot, timezone change, update during active timer, download/share backup, import backup, storage eviction explanation, large touch targets/VoiceOver.

## Integrity rules

No sample records inserted into personal data. No guessed growth curves. Unknown import fields remain unknown. CSV wall times use confirmed IANA timezone and explicit DST disambiguation. Reports exclude unfinished sessions. Active timers are rehydrated before dashboard display. Service workers cache code only, never delete records. Local notification scheduling is best effort while open. No cloud calls at runtime.
