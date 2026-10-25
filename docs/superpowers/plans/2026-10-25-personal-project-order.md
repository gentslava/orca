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

**Files:** `src/shared/personal-project-order.ts`, `src/shared/rpc-contract/client-ui-params.ts`, `src/shared/persisted-ui-state-types.ts`, `src/main/runtime/rpc/methods/client-ui.ts`, `src/main/runtime/client/runtime-client-state.ts`, UI normalization/read/update and protocol capability modules; runtime/persistence regressions.

**Interfaces:** `PersonalProjectOrder` holds per-key `{pinned?,lastOpenedAt?,openCount?}` summaries and persisted bounded sequence watermarks. `ui.recordProjectOpen` consumes destination, previous key and writer/sequence; `ui.setProjectPinned` consumes key, desired pin and writer/sequence; both return acknowledged UI state.

- [ ] Add runtime/persistence regressions for restart, replay, same-project no-op and concurrent distinct writers; run red.
- [ ] Implement atomic mutations, safe normalization, strict schemas and advertised capability; preserve omitted optional metadata; run green.
- [ ] Commit focused persistence/contract changes with normal hooks.

### Task 2: Shared identity, sorting and catalog parity

**Files:** `src/shared/project-section-grouping.ts`, `project-section-order.ts`, `sidebar-list/project-group-sections.ts`, existing mobile catalog/schema, window graph/main feed and desktop/mobile grouping call sites; existing row/parity tests.

**Interfaces:** Resolve the preference key from actual ProjectHostSetup ownership. Attach projected summaries to existing section entries; a common comparator consumes mode, pin/usage and existing Manual rank. Optional metadata travels in existing catalog projection.

- [ ] Add normal/group/feed/mobile ordering and canonical/host-local identity regressions; run red.
- [ ] Implement all four modes and independent pin tiers using shared natural text comparison; carry view-owned ranks through both paths; run green.
- [ ] Commit focused ordering/catalog changes with normal hooks.

### Task 3: Successful deliberate activation and acknowledged controls

**Files:** existing renderer worktree activation and preference actions/menu; project header actions/drag boundary; mobile row-open/settings/options/header control paths; English catalog; focused activation/UI compatibility tests.

**Interfaces:** Successful `navigationIntent:'user-open'` resolves previous/destination logical keys and submits one atomic op to the view owner, after execution acknowledgement. Capability-gated mode/pin actions read acknowledged UI state; no unsupported old-host payload.

- [ ] Add activation failures/background/no-op/same-project and UI acknowledgement/refusal/readback regressions; run red.
- [ ] Implement desktop/mobile personal opens and menus, fixed pin-tier drag boundaries, English keys; run green.
- [ ] Commit focused activation/UI changes with normal hooks.

### Task 4: Verify and deliver

- [ ] Self-review branch against spec, fix material findings with red/green tests, update this checklist truthfully.
- [ ] Run focused suites, actual `pnpm run typecheck:ci --bun-concurrency=1 --bun-threads=2`, mobile typecheck, bounded `pnpm check:changed`, format/quality and normal hooks.
- [ ] Capture English before/after hidden UI proof and instructions; record exact checks and limitations in `/private/tmp/orca-personal-project-order-implementation-report.md`.
- [ ] Verify clean committed tree and report once to coordinator; no push.

## Self-review

Tasks 2 and 3 consume Task 1's optional metadata and acknowledged RPC shape; Task 3 consumes Task 2's identity resolver. All use the same preference keys and view-owner boundary. No generic design approval is pending: the dispatch explicitly requires executing these coordinator decisions without reopening that question.
