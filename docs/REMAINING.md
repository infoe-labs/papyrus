# Remaining acceptance work

This is an explicit handoff checklist, not a claim that all seven phases are complete. Reuse the existing implementation and tests; do not restart or insert fabricated personal records.

## Release blockers requiring missing material or hardware

- [ ] Obtain the **original 49-row Huckleberry CSV**. The repository contains eight synthetic-date examples of the provided format. Do not pad or label synthetic data as the original fixture.
- [ ] Add the original fixture (with user approval if it contains private information) or keep it local through an environment path, and assert all 49 exact classifications/calculations against independently checked expectations.
- [ ] Run the mandatory 49-row import → rings/actogram/history → aggregates → prediction → browser restart timer → backup → duplicate re-import workflow online and offline. Current E2E demonstrates those operations with the eight synthetic-date rows.
- [ ] Execute `IOS-CHECKLIST.md` on a physical iPhone; report actual device/iOS version and results.
- [x] Enable GitHub Pages, run the repository workflow and verify the public HTTPS origin, service-worker control and offline timer persistence. Physical standalone installation remains pending.

## Further specification coverage before calling the whole product production-complete

- [ ] Broaden browser tests for every field combination, custom field types, recurring reminders, plan revisions, schedule constraints and attachment/draft recovery. Native CRUD, conversions, reports and primary migration/timer flows have tests, but they do not prove every permutation.
- [ ] Complete formal accessibility/screen-reader audit. Automated light/dark text contrast and narrow-screen overflow checks now pass. Native labels, modal keyboard management, reduced motion, safe areas and chart text alternatives are implemented; this is not a WCAG certification.
- [ ] Benchmark several years of real tracking data and storage pressure on an iPhone. Date-range summaries are bucketed, child/time indexes exist, history paginates, and ring density is limited to 30 visible days. History is bounded pagination rather than a virtual-scrolling library.
- [x] Calendar month grid and all-date/category/metadata search are implemented.
- [x] Persisted dashboard panel ordering is implemented with touch-friendly up/down controls; card resizing remains optional.
- [ ] Add a dedicated guided reconciliation screen for corrected exports. Current importer identifies possible modifications, preserves existing manual edits, supports review/skip/keep-both and History editing/deletion; it never auto-overwrites.
- [ ] Add per-row time correction controls beyond global timezone/DST policy. Ambiguous/invalid rows are explicitly rejected/reviewed and included in the audit; no instant is guessed.
- [ ] Validate more independent WHO reference cases across ages and length interpolation. Birth median/fifth-percentile regression checks pass. Percentiles are deliberately unavailable beyond bundled age/length ranges and ±3 z rather than fabricated.
- [ ] Refine nap-transition and fragmented-night modeling using longitudinal real history, and widen deterministic scenario coverage. Current predictions use robust 7/14/30-day observations, window sequence, age, prior nap duration, recorded night sleep, bedtime cap and user preferences, with low-data confidence.
- [ ] Complete any remaining visual comparison modes (wake-window overlays / separate previous-week ring comparison) and schedule drag gestures if still desired. Editable schedule inputs and planned/actual comparison work.

## Explicit optional exclusions / limitations

- Voice and photo interpretation are optional and not implemented. Ordinary text parsing, detailed forms and local photo attachments work without them.
- No chatbot, account, payment, caregiver sync, watch integration, native widget or cloud service is included.
- Browser notifications are best effort while open; no closed-app precision claim.
- Growth currently bundles WHO reference tables birth–24 months and weight-for-length 45–110cm. Unsupported cases show raw measurements without fabricated percentiles.
- Sleep starting values and adjustment weights are transparent configurable application heuristics, not a clinically validated or proprietary commercial model.

## Backup subsystem acceptance

- [x] Versioned hashed snapshots, atomic staged restore, no-mutation test restore, retained safety database, media archives and optional encryption.
- [x] Three-generation verified folder rotation, permission/write/read failure tests and no-overwrite single-file fallback.
- [x] Browser disaster recovery after complete IndexedDB/localStorage loss while offline, exact record fidelity and recovered-timer review.
- [ ] Actual iOS Files/share and Android external-folder recovery tests; mobile Chromium emulation and mocked file handles do not establish hardware results.
- [ ] Extended device storage-pressure, suspension-during-write and large media library trials.
