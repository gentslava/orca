# Atomic PR follow-up plans

These tasks belong to the atomic feature branches. Fork-only React Compiler allowances from `composed-ci-contracts.patch` must not be transferred to them.

## PR 33576: transcript history and reader state

Rework `use-native-chat-transcript-row-keys.ts` and `use-native-chat-transcript-slots.ts` so render does not read a mutable committed snapshot. Use an effect/ref boundary or `useSyncExternalStore`, following the current state owners. Preserve row identity while paging, folded-turn disclosures, reader position, and correctness when a render is abandoned or a session changes. Restore the feature's removed tests and resolve the loading cycles as part of its existing redesign.

Acceptance: both hooks compile without new React Compiler diagnostics; meaningful history/prepend/fold and session-switch checks pass. Then remove the two fork-overlay baseline entries: 12 row-key diagnostics and 2 fold diagnostics, 14 in total.

## PR 33371: daily usage chart as the first visible slice

Keep the complete usage feature roadmap in the owning issue and make the daily chart the first complete user-visible slice. That slice must compile cleanly. Restructure the expression triggering `MethodCall::property must be an unpromoted + unmemoized MemberExpression`: separate the member expression from the method invocation while preserving chart data, selection and keyboard navigation. If the failure persists as an oxc compiler bug, keep a minimal reproducible case with its compiler version. Reporting it upstream is optional.

Acceptance: the chart compiles without a new bailout and its rendering and interaction checks pass. Then remove its single fork-overlay baseline entry. Later usage slices must also pass the upstream ratchet without fork allowances.

Usage chart follow-up: the nested logarithm/floor expression now uses an intermediate exponent. With oxc-transform-react 0.152.0 the standalone chart compiles with no diagnostics; its fork-only bailout line is removed.

## Current usage refinements

- History chart, categorical breakdowns and grouping remain owned by PR 33371 / issue 39518. Current component evidence and standalone validation are recorded in that PR.
- Stats-page Comfortable/Wide/Full behavior is independent: PR 40638 / issue 40634. Its four-file change reuses the existing width preference without changing other settings pages.
- Keep fixes reproducible within one feature in its atomic upstream branch. Fork overlays only resolve actual composition, packaging and target-language localization concerns. New product behavior needs its own issue and one-feature PR.
