# Hold-to-quit implementation plan

- [x] Verify clean transferred checkout and create
      `feat/hold-quit-while-agents-work` from exact upstream
      `9b23bd6b6eb3ab426f80165b0c6ee5854832dcfe`.
- [x] Read project instructions, style guide, platform and Git workflow references.
- [x] Trace existing quit/menu/serve boundaries, main and guest/popout input routing,
      settings persistence and terminal/native/remote status projections.
- [x] Self-review continuous hold feasibility against exact Electron/Chromium sources.
- [x] Run hidden unfocused input probes; distinguish Electron input dispatch from
      CDP dispatch and physical AppKit events.
- [x] Escalate Q-release suppression before adding a potentially stale quit timer.
- [x] Resolve the native Command-modified keyup boundary with the coordinator.
- [x] Finalize qualifying activity states, including mixed main/child activity.
- [x] Add failing behavioral tests at settings, activity, menu, input and lifecycle
      boundaries; implement the smallest complete correction using existing owners.
- [x] Add a default-off macOS switch and quiet English hint/progress through
      existing UI primitives; keep local preference outside host RPC updates.
- [ ] Verify default/off/idle, short busy taps, 999/1000 ms, Q/Meta release,
      blur/destruction/toggle/repeat cancellation, one Quit, recorder/injection
      ownership and all supported windows/guests.
- [ ] Verify terminal/editor input does not receive Q; explicit Quit, update,
      signal and serve-host behavior is unchanged.
- [ ] Capture hidden/unfocused English settings and hint proof; label native
      physical input validation separately and accurately.
- [ ] Run focused tests, `pnpm run typecheck:ci --bun-concurrency=1 --bun-threads=2`,
      changed code-quality/format checks and ordinary commit hooks with required env.
- [ ] Review/stage explicit file allowlists, commit the focused implementation,
      and leave it unpushed for coordinator review.
- [ ] Write `/private/tmp/orca-hold-to-quit-report.md` with exact SHA, predicate,
      keys, test counts, evidence paths and limitations; check followups and report
      the true task outcome once.

Resolved design gate: the existing macOS helper owns a full 1000 ms physical
chord-state watch; a JavaScript timer never decides quit. Positive physical input
validation stays separate from injected/source tests. The local universal build
currently lacks x86_64 Swift compatibility archives in CommandLineTools; do not
raise the deployment floor or change build flags to hide this environment limit.
