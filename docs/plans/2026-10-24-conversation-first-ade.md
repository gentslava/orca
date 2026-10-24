# Conversation-first Orca ADE

The user approved implementation on 24 October 2026 after reviewing the repository and competitor research. Work starts on `feat/conversation-first-ade` from `0f91578a9e857fbb7b933fdf101d0c0907000750`. Upstream was `4e7c3538e506b7eebb069911be9269ac834c3356` at the implementation checkpoint. Preserve a small, reviewable fork delta and reuse the existing runtime, transcript, journal, adapters, and orchestration lifecycle.

## Product contract

- Project → conversations → work and results is the normal path. New Chat is the primary creation action; terminals, branches, files, browser, and diffs remain available when needed. Folder projects remain first-class.
- Routine tool activity and successful automatic approval reviews occupy a compact, expandable activity row. The reader sees the assistant's prose without a stream of large operational cards. Expanded activity retains full details, live output, errors, and attribution. Actual questions and required approvals remain actionable.
- Queue preference lives in Chat settings. During a busy turn, Enter follows that preference and Cmd/Ctrl+Enter performs the opposite action; Shift+Enter inserts a newline. The composer has no Queue mode, delivery menu, or instructional strip. A refused operation preserves the draft and states the host limitation. Queue cards can be inspected, sent now, edited, deleted, and reordered without losing text or attachments.
- Model, effort, and Fast choices remain available for future messages while the current turn continues. Existing captured queued-message choices are not silently rewritten. The UI distinguishes requested settings from actual execution.
- Opening a child agent replaces the main transcript viewport with a full child transcript using the normal message renderer. A Back control returns to the parent and restores its position. Nested children, running and completed states, result, host, and provider identity remain inspectable. Missing history is explicit, rather than a blank or invented stream.
- The first complete daily workflow is available in Russian; the full locale must meet the repository's quality and coverage policy. Preserve source text from providers and localized application chrome as distinct things.
- Usage separates current account quota/reset windows from a historical token/cost ledger. History has coherent period/provider/model/project/host filters and drilldown. API-equivalent estimates are labeled, unavailable data stays unavailable, and scan coverage/freshness is visible.
- Self-hosting uses the existing Node-only orcad runtime. A versioned Docker/Compose deployment retains workspaces, journal, account homes, and credential material across container replacement. Desktop connects through existing pairing; server credentials stay server-owned.
- Multi-model execution uses original provider harnesses and existing workers. Add explicit role policies and bounded concurrency/fallback semantics over worker-start; do not create a parallel scheduler or silently retry uncertain operations.
- Claude uses the original installed Claude Code executable through the official SDK or CLI path. Preserve the existing provider agent loop, project/user configuration, authentication flow, permissions, and source of billing. No custom Anthropic inference loop with subscription credentials.

## Constraints

Follow AGENTS.md and docs/STYLEGUIDE.md. Use existing tokens/primitives, checked types, existing host routing, and asynchronous process wrappers. Preserve Windows/Linux/macOS shortcuts, paired-host capability negotiation, old-client fallbacks, and mobile behavior. Do not modify the running production app, user accounts, external servers, or upstream branches. No public deployment or PR publication is part of this local implementation.

All tests and launched application instances use ORCA_BACKGROUND_LAUNCH=1. Rendered validation uses hidden Electron renderers and Playwright CDP, with an isolated profile; never activate or reveal windows. The named electron skill is not installed in this environment; use the repository's existing Electron/CDP harness and record this limitation rather than using computer-use.

## Implementation waves and ownership

### Wave 1

1. **Composer and queue worker:** truthful queue preference visibility, default and unsupported-host explanation, busy-draft keyboard intent, existing queue editing/reordering, and available next-message option controls. Own composer/queue/settings files only; coordinate any shared transcript changes with the coordinator.
2. **Compact activity worker:** existing tool-run/disclosure/notice pipeline; group routine actions into a quiet expandable presentation and quiet successful auto-review notices without suppressing errors. Own tool-run, notice, grouping and directly related tests; do not edit the parent structured-session view without coordination.
3. **Localization worker:** obtain and assess existing Russian translation material, wire the Russian locale using existing i18n, translate/review complete catalogs and pluralization, and check actual visible copy. Own locale infrastructure/catalogs and localization tests. No guessed machine substitutions or English copies represented as translated strings.
4. **Coordinator:** plan, dependency setup, chat-first navigation and defaults, child transcript/back navigation and durable results. Integrate shared renderer boundaries.

### Wave 2

5. **Usage worker:** reconcile existing provider scopes into one useful account/history surface; preserve existing collectors and provider drilldowns. Add remote-host scope where supported without claiming client-local data is remote.
6. **Server worker:** package the existing orcad bundle in production-oriented Docker/Compose with persistent homes/workspaces, existing pairing, health/restart semantics, and documented build/run/update steps.
7. **Coordinator and available worker:** explicit role-based model preferences and observable worker choice, using existing orchestration identities and receipts. Gemini support follows real installed capabilities, with unsupported actions visible.

### Wave 3

8. Independent review of the integrated changes, targeted fixes, focused regression tests, typechecks, changed-code quality checks, build, and hidden rendered validation.
9. Produce a source-built preview and evidence for the full daily scenario. Keep the currently running production app and its sessions intact.

Workers share the feature checkout only under disjoint file ownership. Do not commit or stage other workers' changes. The coordinator integrates, stages an explicit allowlist, and records exact local commit/push state when work is verified. Add worktrees only when a real ownership conflict requires them.

## Meaningful acceptance checks

1. Opening a Git project or ordinary folder leads to a usable chat and a discoverable New Chat action.
2. A working assistant can emit prose and many tool events while routine activity remains one compact row per disclosed group; expansion exposes every retained action and live output.
3. Successful auto-review notices do not create warning cards. Genuine warning/error/approval requests remain visible and actionable.
4. A busy text/image draft follows the Enter preference; alternate send performs the opposite action on that same complete draft exactly once. Both preference values are tested. Queue edit/delete/reorder retain attachments and draft content across remount/reconnect.
5. Old/unknown hosts show a truthful unsupported/loading state and never silently pretend to queue.
6. Model/effort/Fast can be chosen while busy, affect future acceptance, and do not change the running turn or already captured queue cards.
7. A child opens as a full transcript, including tool/prose/result rows, supports nested Back navigation, and leaves a durable completed or failed record after parent continuation and restart.
8. Russian navigation/composer/queue/permission/status/usage/server flows use reviewed translations and correct plural/number/date behavior; catalog coverage passes.
9. History totals, chart, and drilldowns share the same selected range/scope; quota cards retain their actual account-wide meaning; missing or partial data is distinguished from zero and actual spend from estimates.
10. Docker persistence, pairing, reconnect, container replacement, and original provider executable paths are validated without using production credentials or deploying to the user's server.
11. Model-role policy chooses a supported provider/model explicitly and reports why; unknown delivery never triggers a duplicate write task.
12. Verification covers light/dark, narrow viewport, folder/Git, local/paired-host, and cross-platform shortcut semantics where affected.

## Progress

- [x] Research and user approval of the product direction.
- [x] Clean baseline and isolated feature branch.
- [x] Dependencies and runtime coordination prepared.
- [x] Wave 1 implemented and integrated.
- [x] Wave 2 implemented and integrated.
- [x] Russian catalog complete and reviewed.
- [x] Independent review corrections complete.
- [x] Focused tests, typechecks, quality checks and build pass.
- [x] Hidden Electron/CDP evidence and preview ready.

Implementation notes and exact verification results will be appended here as they become available. Research artifacts remain in the chat scratch directory; no pre-existing PR is considered merge-ready based solely on its description.

## Checkpoint: 24 October, initial integration

- Node24 dependency install completed; production Orca was not replaced or restarted.
- Run `run_d240bc706893` coordinates real Orca workers. Compact activity task `task_a70515806b16` / `ctx_b3ef2d6113ce` succeeded and was released with archived transcript. Reusing its structured handle through worker-start was refused before a new Task was created (`terminal_unsupported_for_agent_session`); task inventory confirmed no Usage attempt, so a fresh supported agent launch was used.
- Composer task `task_0dc41f6b4466` / `ctx_bc1983422f49` reports 484 focused tests passing and web/node typechecks; final settlement pending.
- Daily locale/infrastructure task `task_97f0b0c82df2` / `ctx_20e8336621bf` reports 236 localization tests; complete Russian remains outstanding (roughly15k source keys). Upstream Russian machine translations contained serious semantic errors and were not bulk imported.
- Usage task `task_75730baa7294` / `ctx_ea939a4298e6` is implementing the coherent historical ledger and account quotas. Remote historical API does not yet exist; never render local history as remote.
- Coordinator added a default Conversations sidebar using existing AiVault history, compact single-click session rows, New Chat actions, and workspaces/activity navigation.
- Coordinator child transcript tests: 23 passed. Sidebar/history/child-focused follow-up: 41 passed.
- Hidden Electron/CDP fixture passed compact actions, full child and nested Back navigation, light/dark and narrow layout; windows verified invisible/unfocused. Evidence `.bench-fixtures/conversation-first-Dn8112/`. Nested scroll retention/find routing added afterward and will be rechecked.
- English catalog extracted to17152 keys and queue description corrected to match image/reorder behavior. Full E2E Russian scenario awaits the coordinator-owned e2e build.
- Docker packaging, role policies, full Russian coverage, independent review, final full gates and source-built preview remain required.

## Checkpoint: 24 October, 23:28 local

- User refined the queue contract: settings only, reciprocal Enter/Cmd/Ctrl+Enter, no extra Queue control or explanatory strip in the composer. Implemented on both text/image request paths, retaining host capability checks and current-turn choices. Unsupported explicit queue/immediate actions keep the draft. Hidden renderer fixture passes both shortcut preferences, queue edit/reorder/delete/steer, parent draft retention and nested child Back navigation (`.bench-fixtures/conversation-first-iHCgAY/`).
- Real isolated Russian Electron E2E passed the Appearance language picker, persisted choice, original provider text and Russian editable composer (1 test, 9.0s). Production app stayed intact; all launched windows remained hidden.
- Composer/daily locale/activity workers settled successfully and were released with transcript archives. Local Usage task `task_75730baa7294` / `ctx_ea939a4298e6` settled with 519 tests across 63 files and full typecheck green; its transcript was archived on release.
- Active workers: role routing `task_7ef76dcc080f` / `ctx_9609da2411ce`; remote historical usage `task_86b6397b34e0` / `ctx_b77fdbc6a748`; Docker `task_59275a346f6a` / `ctx_7b546e6de0e9`. Docker pairing/restart/replacement, sealed placeholder persistence and shutdown have passed disposable real-container fixtures; final provider PATH and collector-worker packaging integration remain in progress.
- Reused 398 manually reviewed full phrases for 1,414 additional Russian IDs; ambiguous homographs were held for context. Corrected queue setting copy and compact chat naming. Full Russian still remains incomplete and must not be claimed done.
- Found project-add navigation did not request the existing default-chat path; correcting Git and folder project entry points, preserving explicit Blank Terminal and withheld launch decisions.

## Checkpoint: 25 October, final integration

- Settings-only queue contract is implemented without composer modes or a preference action in the feed. Unknown/old hosts retain busy drafts instead of silently sending. Opening-turn steering retains the current accepted options.
- Separate structured worker journals open read-only on the exact owning runtime, with nested Back navigation and parent draft/scroll retention. Completed rows and recorded results persist; optional agent/local/WSL/SSH/federated labels remain display facts. Unavailable full journals are explicit. Independent review's child file-context and hidden-parent typing/paste findings are repaired; focused input/paste/context/child checks pass 65 tests in four files.
- Usage account provenance uses existing dedicated account homes and collectors. Copied/shared/legacy events remain unknown when attribution is not provable; no current-login inference. Quota windows remain account-wide. Expanded collector/RPC/Stats checks pass 617 tests in 72 files. The existing chart now switches between tokens and API-equivalent cost and distinguishes missing prices from zero.
- Full Russian strict coverage passes: 17,494 English source IDs, 16,615 translated values, 879 reviewed original technical/native values, 146 extra CLDR forms, zero missing or unreviewed copies. The final locale regression passes 319 tests in 25 files.
- The real component Electron fixture passes reciprocal queue shortcuts, edit/reorder/delete, compact activity, nested/independent worker history, live Russian, account filters and cost chart, model/effort/Fast controls, role settings, and light/dark/narrow layouts. Latest checkpoint: `.bench-fixtures/conversation-first-JAuWrI/`. Windows stayed hidden with an isolated profile.
- Fresh UI defaults and renderer hydration now both close the file sidebar; explicit legacy choices remain preserved. Incidental workspace activation retains the conversation view, while an explicit rename opens Workspaces. ACP plus persistence/navigation regression: 960 tests in 88 files. Retention checks assert completed agents remain inspectable without monitoring or Stop, replacing obsolete null-roster expectations.
- Role profiles, remote historical usage, Docker packaging, localization domains/grammar, child metadata and account-provenance workers have succeeded and been released. Original Gemini CLI 0.65.0 ACP integration passed 351 focused tests, real executable initialization/signed-out checks, core/mobile typechecks; unsafe replay on reopen is explicitly refused while saved journal history remains readable.
- Final source build, full-app hidden E2E, current Docker image and local commit metadata are recorded in [the handoff](./2026-10-25-conversation-first-handoff.md). Historical checkpoints above retain their original evidence states.

## Final navigation and pre-commit acceptance

- Primary Conversations now includes durable Orca records independently of provider handles/files, including empty Gemini chats. Stored session/workspace/host identities drive activation and grouping. Creation, rename and settled activity refresh without forced disk rescans; provider file actions remain unavailable on record-only rows. Released orchestration children remain under their parents. This correction passes 384 tests in 20 files.
- Extracted cohesive prompt/transcript, launch-preflight, mobile scroll, provider-row and file-confirmation responsibilities to satisfy ordinary file-size lint without suppressions or budget increases. Post-extraction regression groups pass 334 chat tests, 203 runtime tests and 130 mobile/file-action tests.
- Node/Web/CLI/mobile typechecks, 472-file changed-code quality, ordinary lint across 474 source files, the final Electron/CLI/web builds and the full-app Russian E2E pass. The latter passes one test in 5.4 seconds. The source fingerprint stayed unchanged during the final build.
- All 20 Orca attempts succeeded, reports were accepted, transcripts archived and worker terminals released. The Run has no active or reclaimable worker.
