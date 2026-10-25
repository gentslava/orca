# Personal Project Order Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, task by task. No helper agents (dispatch constraint).

**Goal:** Order and pin projects using successful personal openings on desktop and mobile.

**Architecture:** Extend existing UI persistence, atomic runtime mutations and project catalog projection. Share identity and comparator across both sidebar input paths and mobile; capability-gate new writes.

**Tech Stack:** TypeScript, React/Zustand, React Native, Zod, Vitest and existing component fixtures.

**Spec:** `docs/superpowers/specs/2026-10-25-personal-project-order-design.md`

## Global Constraints

- Base exactly `9b23bd6b6eb3ab426f80165b0c6ee5854832dcfe`; only this checkout; no push/publication.
- Existing project identity, UI view owner, execution routing, host/group hierarchy and Manual persistence remain authoritative.
- No activity-derived backfill, event history, new dependency, locale import or launch-policy change.
- Every test/app uses `ORCA_BACKGROUND_LAUNCH=1`; Node 24.22.0; controlled pnpm dependency settings; bounded workers.

## Review Focus

- Offline catalogs retain preferences and never authorize local execution fallback.
- Same IDs on different owner hosts remain distinct for local/folder projects.
- A remote activation refusal cannot increment usage or claim a saved mode/pin.
- Old clients' unrelated UI patches preserve optional new metadata.
- Manual cross-tier drops cannot silently lose a move.

### Task 1: Atomic persisted preferences and wire compatibility

**Files:** `src/shared/personal-project-order.ts`, `src/shared/rpc-contract/personal-project-order-params.ts`, `src/shared/persisted-ui-state-types.ts`, `src/main/runtime/rpc/methods/client-ui.ts`, `src/main/runtime/client/runtime-client-state.ts`, UI normalization/read/update and protocol capability modules; runtime/persistence regressions.

**Interfaces:** `PersonalProjectOrder` holds per-key `{pinned?,lastOpenedAt?,openCount?}` summaries and persisted a monotonic revision and 4,096 bounded exact writer/sequence IDs. `ui.recordProjectOpen` consumes destination, previous key and writer/sequence; `ui.setProjectPinned` consumes key, desired pin and writer/sequence; both return acknowledged UI state.

- [x] Add runtime/persistence regressions for restart, replay, same-project no-op and concurrent distinct writers; run red.
- [x] Implement atomic mutations, safe normalization, strict schemas and advertised capability; preserve omitted optional metadata; run green.
- [x] Commit focused persistence/contract changes with normal hooks.

### Task 2: Shared identity, sorting and catalog parity

**Files:** `src/shared/project-section-grouping.ts`, `project-section-order.ts`, `sidebar-list/project-group-sections.ts`, existing mobile catalog/schema, window graph/main feed and desktop/mobile grouping call sites; existing row/parity tests.

**Interfaces:** Resolve the preference key from actual ProjectHostSetup ownership. Attach projected summaries to existing section entries; a common comparator consumes mode, pin/usage and existing Manual rank. Optional metadata travels in existing catalog projection.

- [x] Add normal/group/feed/mobile ordering and canonical/host-local identity regressions; run red.
- [x] Implement all four modes and independent pin tiers using shared natural text comparison; carry view-owned ranks through both paths; run green.
- [x] Commit ordering/catalog and activation/UI together with normal hooks (one coherent integration change after the persistence commit).

### Task 3: Successful deliberate activation and acknowledged controls

**Files:** existing renderer worktree activation and preference actions/menu; project header actions/drag boundary; mobile row-open/settings/options/header control paths; English catalog; focused activation/UI compatibility tests.

**Interfaces:** Successful `navigationIntent:'user-open'` resolves previous/destination logical keys and submits one atomic op to the view owner, after execution acknowledgement. Capability-gated mode/pin actions read acknowledged UI state; no unsupported old-host payload.

- [x] Add activation failures/background/no-op/same-project and UI acknowledgement/refusal/readback regressions; run red.
- [x] Implement desktop/mobile personal opens and menus, fixed pin-tier drag boundaries, English keys; run green.
- [x] Verify that combined integration commit contains the activation/UI changes.

### Task 4: Verify and deliver

- [x] Self-review branch against spec, fix material findings with red/green tests, update this checklist truthfully.
- [x] Run focused suites, actual `pnpm run typecheck:ci --bun-concurrency=1 --bun-threads=2`, mobile typecheck, format/quality and normal hooks.
- [ ] Complete the aggregate bounded `pnpm check:changed` gate: incomplete; the interrupted related-test process left the gate at exit 1 (see Final gate disposition).
- [x] Capture English before/after hidden UI proof and instructions; record exact checks and limitations in the [PR Testing section](https://github.com/stablyai/orca/pull/33502#testing) and [durable verification evidence](https://github.com/gentslava/orca/issues/1#issuecomment-6396521711).
- [x] Verify clean committed tree and report once to coordinator; no push (final handoff after this documentation commit).

## Self-review

Tasks 2 and 3 consume Task 1's optional metadata and acknowledged RPC shape; Task 3 consumes Task 2's identity resolver. All use the same preference keys and view-owner boundary. No generic design approval is pending: the dispatch explicitly requires executing these coordinator decisions without reopening that question.

## Execution evidence

- Task 1 committed as `54a5bb864d7`; real dispatcher regressions were red before adding the two RPCs, then green. Actual SQLite restart uses the store's explicit `flush()` durability barrier before closing.
- Shared row-building regressions exposed the missing personal order/pin behavior and same-ID host-local merging before correction. The post-extraction desktop/runtime selection passes 14 files / 103 tests; the earlier complete activation selection passed 30 files / 245 tests.
- Mobile tests caught a deferred old-host navigation regression; the legacy capability branch now preserves synchronous navigation. Self-review also caught that Resume's execution-host gates differ from the UI owner's capabilities: the helper now probes the existing view client before any new payload, with a red/green mixed-owner regression.
- Full required Bun typecheck passed (17,778 node, 15,852 renderer, 3,229 CLI and 34 additional files); mobile Bun typecheck passes 3,095 files and the nine-file mobile parity selection passes 100 tests after the Resume correction.
- Hidden English proof: 16 desktop light/dark screenshots, with DOM interactions verifying all mode acknowledgements, preserved Manual and acknowledged Pin/Unpin labeling; three actual mobile option-control screenshots. No visible Orca instance, provider login or model request.
- Initial changed gate failures (line limits, duplicate imports, assertion typing, nested English keys) were corrected without gate/baseline changes. Stale sandboxed related-test processes were stopped only after verifying ownership; the exact-base two-worker gate is rerun outside the sandbox with local-cache mode and retained logs.

## Final gate disposition

Source integration committed as `3b0608bd009` with normal hooks. The mandatory `pnpm check:changed --base=9b23bd6b6eb3ab426f80165b0c6ee5854832dcfe --maxWorkers=2` was run with local-cache mode outside the sandbox; 27 of 28 checks passed. Its broad related-test process was interrupted after two workers remained idle beyond configured timeouts, and the gate exited 1 after 643.8 seconds. Partial runtime output named two unchanged folder-import tests; an isolated recheck reproduced `/var/folders` versus canonical `/private/var/folders` expectation failures. This aggregate gate is not green. The coordinator explicitly requested a bounded handoff with this limitation and independent root validation/CI, rather than further broad reruns or source/baseline edits.

The two isolated folder-import cases pass with canonical `TMPDIR=/private/tmp` (2 passed / 1,504 skipped); this confirms the path-alias failure recovery without changing source/tests. The aggregate interruption remains a limitation and was not rerun broadly.
