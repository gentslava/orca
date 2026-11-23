# Personal Orca builds

[MAINTENANCE.md](MAINTENANCE.md) describes the current update, validation and release procedure. This file records the integration design, package details and historical refresh decisions.

`main` is the upstream mirror. `master` contains the qualified composed application, the daily/manual workflow and this selection. Source refreshes may land through a fully green pull request before packaging; the release ledger separately identifies the last successfully packaged application. There is no additional integration branch.

Generated integration, packaging and promotion commits use GitHub's standard `github-actions[bot]` identity. Original upstream and PR commits retain their authors. Integration subjects use `fork: integrate PR NUMBER`; the source SHA remains in the Source-Head trailer and build plan. Fork status reports use plain PR numbers without issue mentions or upstream URLs, so routine builds do not add cross-reference events to upstream discussions. Keep personal package and CI reports in this fork; upstream PRs describe and validate only their own changes.

The workflow freezes fresh `stablyai/orca:main`, discovers all open main-targeted PRs by the configured authors (including drafts), and adds explicitly selected community PRs. `seed` and the persistent fork status issue retain previously selected PRs after closure. Closed unmerged PRs block publication until a replacement or a reasoned exclusion is recorded. Merged PRs are omitted only after their merge commit is proven to be in the frozen upstream. A build pinned to an explicit upstream snapshot may predate such a merge: the PR is then composed from its final head, provided its merge commit is in the observed main and the head carries no upstream history newer than the snapshot. Any other merged PR outside the frozen upstream blocks publication.

A deliberately retained closed PR must be listed in `retainClosed` with a nonempty reason. Its freshly resolved head is composed with the same identity and conflict checks as an open PR. Exclusion/replacement and retention cannot coexist for one PR. The narrower native selection fix in PR 36892 is superseded by PR 38022, which also protects the editor insertion magnifier after a physical-handset reproduction. No head is pinned in configuration.

Retained closed PRs with `retainedHeadSources` use the explicitly named fork branch, because GitHub keeps a closed PR head frozen. Planning pins both the closed head and the current branch head, checks repository/ref identity and ancestry, and rejects missing, rewritten or concurrently moved branches. The plan and fingerprint preserve this provenance; no stale-head fallback is used.

An explicitly included open foreign PR may use `foreignHeadSources` to resolve upstream conflicts in a branch owned by a configured author. The original PR head must remain an ancestor of that branch. Both heads are freshly pinned and checked for concurrent changes, and recorded in the plan and fingerprint. This keeps feature corrections with their original PR ancestry rather than in the combined-source overlay. An upstream merge returns to the normal ancestry check; an unmerged closure still blocks publication pending review.

Each feature is merged as its tree delta from its unique common ancestor with the frozen upstream. This prevents shared historical fork merges from undoing an earlier selection. The final integration commit has only the preceding composition as its parent. Original PR branches and temporary merge snapshots are not imported into published ancestry. This uses Git plumbing available at the supported baseline.

Every selection is required. Dependencies are explicit PR-number arrays; ties use ascending PR numbers. No dependencies are inferred from titles or reviews. A moved PR head fails planning. Direct upstream conflicts and conflicts caused by the selected combination are reported separately. The diagnostic composition may continue after a conflict to list further failures, but cannot be packaged or published. An outdated compatibility patch is a blocker as well.

When every conflicted path is an English or Russian desktop/mobile translation catalog, composition attempts a strict three-way merge by key. Independent additions and unchanged-side removals are retained; different edits to one key, delete/edit races, duplicate keys and non-catalog values fail. Source-code conflicts require a reviewed integration patch in `merge-resolutions/manifest.json`: the path and all three Git blob identities must match exactly. The patch and resulting file are SHA-256 checked. This preserves atomic upstream PRs while recording the explicit corrections required only by their selected combination; changed or unknown preimages block publication. `plan.json` records each successful locale merge in `result.localeMerges`, with its PR number and exact paths. Every resulting catalog is also checked after text-clean merges; duplicate keys stop planning. See [the reviewed integration corrections](merge-resolutions/README.md) for the fork-only source resolutions.

## Operation

- Daily at 03:37 UTC, plus manual **Personal upstream + PR build** on `master`.
- Pull requests and scheduled builds freeze the current upstream main once in planning. Manual diagnostics can select a full ancestor SHA with `upstream_commit`.
- `audit_only`: resolve lifecycle and test composition; never package.
- `force_build`: bypass reuse of an identical last successful composition.
- Persistent [status issue](https://github.com/gentslava/orca/issues/12): current report, lifecycle ledger, and last successful downloads.
- Each run retains plan/report artifacts for 14 days. Successful prereleases retain ARM64 DMG and ZIP, Windows x64 installer and portable ZIP, Linux x64 and ARM64 AppImage/DEB/RPM, Android APK, checksums, archive/app proofs, the source plan and a Git bundle. After independent package verification and draft asset verification, a trusted job promotes the built application to `master` and its frozen upstream to `main` in one atomic lease-protected push. Each selected PR contributes one linear commit over clean upstream main; original PR heads are recorded in commit messages and the build plan, not imported as parents. Required compatibility/localization corrections are folded into one commit. Promotion adds only the fork control commit, without the previous master as a parent. The replaced master is retained in an archive/master-<full-sha> branch in that same atomic push.
- Required conflicts or failed checks preserve the current verified release. No silent subset build or automatic substitution/closing of upstream issues/PRs.

Upstream mirror and source maintenance do not wait for hosted packaging capacity. A source refresh preserves upstream and feature ancestry and must pass the full pull-request checks before merge. Transient EOF, connection-reset, TLS-connection, timeout and HTTP 502/503/504 failures retry read-only GitHub metadata requests and Git fetch/ref discovery up to three times; pushes, API mutations and permanent failures are never retried automatically.

The package lane builds one shared JavaScript artifact using the upstream release artifact implementation in development mode, then restores its source/configuration-checked bytes on every desktop runner. Each native host uses the upstream host-resource build and electron-builder targets. Linux reuses the upstream format packager with private per-format copies of one unpacked application; a guarded adapter selects the native architecture and personal package configuration. The package lane builds/typechecks the production desktop/CLI/web/mobile resources and native helpers. Trusted verification independently re-extracts DMG/ZIP, checks ARM64, code signatures, embedded source/version identity, the app-tree manifest and package digests. It does not launch the application. Component/unit checks do not establish physical-device or provider acceptance.

Packages use ad hoc integrity signatures, without Developer ID/notarization. Browser downloads may acquire macOS quarantine even though the same locally built app starts normally. Install a verified personal release from an updated fork checkout using Node and GitHub CLI:

```sh
node config/fork-build/install.mjs --wait --launch
```

Run this from Terminal and quit Orca completely when prompted. The installer selects the last successfully promoted release, verifies GitHub asset digests, the embedded source/version/architecture and full app manifest, then copies without propagating quarantine. The existing app is retained as a backup; running bundles are never replaced. No Apple Developer membership or global Gatekeeper change is required for this local installation. Use `--release personal-RUN-ATTEMPT` to pin a release, `--destination /path/to/Orca.app` for another install location, or `--assets-directory /path/to/downloads` to use existing downloads with the same mandatory verification.

Promotion preserves only the pinned fork workflow, pipeline scripts/tests, preview updater test and `AGENTS.md` over the built source. The promotion commit has only the built source as its parent; previous master history is retained in a separate archive branch. Both old branch identities are checked against the push advertisement. A concurrent update or a newer/divergent mirror blocks both updates. Only master may be replaced using its exact expected SHA lease, atomically with the archive backup; main must remain a fast-forward. Audit-only, failed and unchanged-input runs do not promote. Configuration fingerprints use the controlled files rather than the master commit, so source promotion alone does not force another build.

Build jobs execute the composed source with read-only repository permissions and no publishing/signing secrets. Publication uses a separate fresh runner and trusted master scripts. It checks only artifacts from the same workflow run. Publication never overwrites an existing release. After promotion, the publication job opens the verified draft and the status job records the result.

## Editing selection

Required PR 40175 retains unified native Settings, launch and composer model-menu policy with host-owned catalogs. Its current head intentionally leaves Antigravity terminal model discovery unchanged. Listing Claude and GPT-OSS from the execution host’s `agy` catalog remains a separate owner-requested follow-up; inclusion of 40175 alone does not deliver it. The fork compatibility merge preserves current Settings catalog callers and both host-wide and per-agent catalog invalidation. Its four source resolutions are guarded by exact base/ours/incoming blobs. The integration overlay removes the duplicate new-launch default helper and duplicate fallback-copy keys introduced when this foreign head meets current upstream; upstream translations remain authoritative.

Edit `selection.json` on master. Keep community PR numbers in `include`, with a reason. Use `exclude` for a deliberate retirement/hold, `replacements` for reviewed unmerged-PR successor mappings (effective before upstream closure), and `dependencies` when application order matters. Required compatibility corrections are listed explicitly. Pins and optional silent fallbacks are intentionally not supported: maintain compatibility in the actual atomic PR instead.
The retired hovercard fixture correction (PR 37279) is supplied by merged PR 37276. The changed file was verified identical to upstream; the obsolete PR is closed and recorded as a replacement.

Replacement 40728 → 43959 takes the merged Session History host fix from upstream. The upstream change consults workspace navigation history, so the selected host survives a panel remount and still follows the next opened workspace. The original hook test import relocation is no longer needed.

Replacement 40816 → 41430 adopts the merged welcome-screen Reopen closed tab repair, including folder-workspace activation and the Settings shortcut-recorder guard. The original closed contribution stays seeded so planning records its successor even without prior status history. The replacement is omitted only when its merge commit is present in the selected upstream snapshot. Native Chat restoration and paired-runtime terminal restoration remain separate open issues 40841 and 40842; build 92 predates this replacement.

Mobile shared-reader lifecycle: merged PR 39727 carries the same four-file patch as closed PR 39022. The replacement records that maintainer port; composition verifies its merge ancestry before omitting it from the personal build.

SSH test isolation: merged PR 40673 carries the exact patch from closed PR 40293, preserving its author, and also clears credential-decline holds in the shared connection fixture. The replacement prevents the closed original from blocking selection; composition requires the successor's merge ancestry before treating the fix as supplied by upstream.

The noisy readable-transcript warning (PR 36858, issue 36856) is supplied by merged PR 37211. The current scanner reports a failure only for unreadable conversations. The retired PR’s separate older-host disclosure enhancement is omitted from the required product build.

Mobile media lifecycle: PR 36922 in upstream supersedes PRs 36569 and 36574 by reserving four of the existing 64 bridge slots for native verbs. PR 36572 is retired because shipped shells install their channel per document, rather than replacing it inside a live document. These lifecycle decisions retain the historical Attach Photos investigation; they do not claim its original handset failure was reproduced or fixed.

Mobile queue lifecycle: merged PR 36928 supersedes PRs 36606 and 36607 for the excess blank scroll range and translated Save/Cancel sizing. Both retired PRs resolve to that successor; composition verifies its merge commit is in the current upstream instead of reapplying their older implementations. PR 36927 independently fixes the Auto agent default on desktop in upstream.

Tests run without application dependencies:

```sh
node --test config/fork-build/selection-retained.test.mjs config/fork-build/composition.test.mjs config/fork-build/status-record.test.mjs config/fork-build/promotion.test.mjs
actionlint .github/workflows/personal-build.yml
```

The macOS fork-upstream preview remains available for manual diagnostics and produces Actions artifacts. The personal workflow owns branch promotion.

Claude fallback lifecycle: merged PR 37958 supersedes PR 37861, including separation of response observations from saved model preferences. The old fallback integration resolutions are removed. Merged PR 37968 supplies compact orchestration cards; PR 33403 now carries only human-authored chat navigation and preserves upstream card rendering on desktop and mobile. The merged successors are required by number and ancestry, without head pins.

Each run resolves current upstream main and live PR heads, then records their immutable identities for that run. Selection contains no fixed heads.

Before packaging, the exact composition passes formatter and changed-source quality checks, the desktop/mobile build and its selected regression suites. The current new-chat effort-at-rest regression is included even when its file did not change in the feature selection.

The refreshed compatibility overlays retain the preview updater guard, early durable chat catalog, explicit empty-workspace actions, and conversation/project ordering. Other overlays contain required owner imports, portable boundary checks, model-fallback integration coverage, current test-owner wiring. Obsolete mock suites and source-size extractions superseded by upstream are omitted. New source resolutions still require the exact three input blobs and verified patch/result digests. Import corrections already present in refreshed atomic heads are removed after a reverse-patch check against those exact heads.

Retained personal features: PR 34365 keeps bounded photo-picker refusal diagnostics even though upstream issue 34351 was closed as not reproducible. It records checked source/stage/reason facts locally, without claiming the original handset failure was reproduced. PR 38848 keeps the owner's newest-queued-message shortcut; upstream intentionally sends the first card. Its preview follows the newest card on desktop and mobile, while the explicit desktop Shift chord still targets the first. Both freeze current fork branch heads through `retainedHeadSources` and remain required after upstream closure.

The required composed CI contract overlay keeps aggregate file-size limits, current effort-slider interactions, structured-send request shapes and child-roster assertions aligned with the selected features. It also preserves streaming-preview input identity while a pending message is visible. The mobile drawer check follows the chat-first host screen before verifying hardware Back claims. These corrections run after the semantic overlays. The formatter checks the final composition; its retired outline-only correction is already formatted in the current atomic owner. They fail composition when their source context changes; the normal full PR checks remain enabled.

## Temporary React Compiler debt

The reviewer accepted the following existing, uncompiled feature functions for this fork iteration. Their baseline entries live in `composed-ci-contracts.patch`; the composed source materializes that overlay for its full PR checks. They must not be copied into atomic PR branches. New diagnostics remain gated, and `NativeChatStructuredSession.tsx` loses its improved baseline entry rather than retaining a spare allowance.

| File                                                                                             | Bailouts | Owning PR | Removal plan                                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | -------: | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/src/components/native-chat/use-native-chat-transcript-row-keys.ts`                 |       12 | 33576     | Replace render-time committed-snapshot reads with an effect/ref boundary or an owner-style external store; remove this overlay baseline entry. |
| `src/renderer/src/components/native-chat/conversation/slots/use-native-chat-transcript-slots.ts` |        2 | 33576     | Preserve fold/history state through the same committed-snapshot redesign; remove this overlay baseline entry.                                  |

The removal work is recorded in [the atomic PR plans](atomic-pr-plans.md). The two history entries contribute 14 diagnostics, not 14 separate source files. They disappear together when PR 33576's redesigned history code compiles. PR 33371 now compiles without diagnostics after separating its nested logarithm/floor expression; its chart baseline entry has been removed.

## Fork translations

Feature branches own English copy. Sparse Russian desktop/mobile catalogs live in `localizations/` and are applied only to composed fork source. Planning validates English keys, placeholders and duplicate keys, and rejects a different existing translation. The plan and build fingerprint record each overlay digest. Missing or stale overlays block publication.

## Fork-local features

Some of the owner's preferences differ from a deliberate upstream decision. They live only in this fork, on a branch with no upstream PR. `forkFeatures` in `selection.json` names each branch by a stable slug:

```json
"forkFeatures": {
  "activity-row-project-only": {
    "ref": "refs/heads/fix/activity-row-project-only",
    "reason": "Activity rows name only the project; upstream keeps the workspace name."
  }
}
```

Each entry needs a lowercase kebab-case slug, a `refs/heads/` ref and a nonempty reason. The repository is the fork running the build (`GITHUB_REPOSITORY`, so local planner runs set it to `gentslava/orca`). An explicit `repository` must belong to a configured author. Unknown fields, two slugs on one branch, and a branch already used by `retainedHeadSources` or `foreignHeadSources` are rejected before any branch is read.

Planning reads each branch through the API and requires the canonical repository name, the exact ref and a commit. It pins that head, fetches the branch, and rejects a head that moved or was rewritten after the pin. A missing branch fails planning; there is no fallback to an earlier head.

Features compose after every upstream PR, in slug order, with the same merge, translation-catalog and reviewed-resolution checks. Resolution records match by path and the three blob identities, so they need no PR number. Name a feature's patches after its slug, for example `refresh-0bd3-activity-row-project-only-0.patch`. A head already contained in the frozen upstream is reported as satisfied and skipped. A branch carrying upstream history newer than the frozen upstream blocks publication, because that history would enter the build as part of the feature. Merge the pin into the branch, feature first, as for PR branches, and choose a pin no older than each feature's upstream merge base.

Integration commits are titled `fork: integrate feature SLUG` and keep the Source-Head trailer. `plan.json` records each feature's slug, repository, ref, reason and pinned head under `forkFeatures`. Result entries name the feature by slug in `included`, `satisfiedFeatures`, conflicts, blockers, translation merges and reviewed resolutions. The build fingerprint includes every pinned feature head. Qualification and promotion count feature integrations like PR integrations. The status report lists features by slug and branch, without upstream links. The status ledger does not track features, so removing one is an explicit selection change. The checks are in `fork-features.test.mjs`.

## One source for macOS, Windows and Android

Publication rechecks the live upstream main against the source plan after all platforms and independent package checks finish. A moved main blocks publication and requires a fresh composition and checks; rerunning the old package jobs cannot make that source current.

Every run resolves the latest upstream main and live PR heads once, then shares that exact plan and Git bundle across all three required package jobs. Windows and Android are independently extracted and verified on fresh trusted runners before the common release can be published. A failure on any platform blocks publication and promotion; the status issue names every result. No partial release or older-upstream fallback is automatic.

macOS packaging uses the standard `macos-26` ARM64 image. The separate trusted publisher uses `macos-26-intel`: archive verification reads the ARM64 binaries with `lipo` and `codesign`, without launching them, so it does not need an ARM64 runner. The native ARM64 build guard, target architecture check, signatures, full app-tree comparison and common publication gate still apply. Infrastructure retries rerun failed jobs and preserve successful platform packages.

Fork CI uses the same `macos-26` ARM64 image for performance contracts and the ARM64 hostile-host cell. The macOS 15 ARM64 pool failed to acquire either job twice during the November 10 refresh. The Intel hostile-host cell stays on `macos-15-intel`; all platform cells, assertions and repository permissions remain intact.

Windows uses the existing native build and electron-builder configuration with a fork-only unsigned x64 wrapper. No signing or publication secrets are available to the build jobs. Installer and ZIP must contain the same complete application tree, PE architecture, numeric ProductVersion, full fork-preview FileVersion and embedded source receipt as the unpacked build. Build the NSIS installer first, then the portable ZIP from its completed unpacked tree with `--prepackaged`; NSIS adds `resources/elevate.exe` after an ordinary parallel ZIP target would already have captured the tree. The updater preview guard also runs on Windows. Checksums are in `windows-SHA256SUMS`; use `Get-FileHash <download> -Algorithm SHA256` before installing the unsigned installer or extracting the portable ZIP. The macOS install script remains macOS-only.

Android uses the existing Expo/Gradle release path with the committed mobile version/code and existing Expo debug certificate. Production signing requirements block this debug lane rather than being bypassed. Its APK manifest, ARM64 libraries, signing certificate, source receipt and digest are rechecked on a fresh Linux runner. Certificate reports accept the legacy numbered signer and current `V2 Signer:` labels, but require exactly one SHA-256 certificate line matching the pinned Expo identity; unknown or additional certificate lines are refused. Checksums are in `android-SHA256SUMS`. The shared desktop version and mobile version are recorded separately. A rejected APK is retained for three days as a diagnostic Actions artifact and cannot enter publication. Neither static package verification nor CI claims real-device acceptance.

Replacement 40499 → 40496 uses the identical upstream ACP restart digest repair; its merged ancestry is required before the duplicate fix is omitted.

The usage-history layout and cursor-adjacent day readout are owned by atomic 33371. Its reactive chart, breakdown, account-label and currency formatting corrections now live in that branch; their current-upstream import relocations also live in the atomic branch. The Skills action reuses its existing declared translation key.

Merged 33403 is supplied directly by upstream. Explicit selections 40297 and 40298 preserve the artifact Update-button layout and the saved-server rename requested in owner issues. The open rename implementation is included until upstream ships it. `runtime-environment-rename.patch` exposes the same store operation as an offline `orca environment rename --environment <selector> --name <name>` command; only this client's saved name changes, preserving pairing and identity. Its regression also protects opaque newer store records and redacted output. Rename and pairing replacement share one write of the replaced saved entry, so `runtime-environment-store-operations.ts` keeps upstream's nine blocking-helper references. The supplement keeps store selection, IPC rename and web saved-record mutations in bounded modules and moves async cleanup outside React compilation; no compiler or line-count budget is relaxed. The Russian overlay also covers the General settings page, its destinations, search keywords and breadcrumb navigation.

Replacement 36736 → 40148 adopts upstream account migration. The small `codex-selected-account-read.patch` retains only fail-closed unreadable Codex selection and its regression tests; Claude retains upstream behavior. The merged migration searches the target home first, preserving its existing rollout; absent targets still use the existing no-overwrite migration helper. Never-sent chats select their new home without requiring a saved rollout.

`composed-source-modules.patch` keeps the promoted fork eligible for the full PR checks without relaxing source budgets: chat list/message/send input contracts and restart/Stop wiring live in focused existing or adjacent domain modules. Markup, delivery ordering and public wire contracts are preserved. It also recognizes the existing `.test-harness` spelling alongside `-test-harness` in the test-only mocking policy. These corrections belong in their atomic feature branches during the planned cleanup; the composition overlay preserves them until then. No max-lines suppression or expanded budget is added.

The timer-drain compatibility correction was retired after upstream 40512 removed its sole stalled-hidden-restore case. Its unused fixture helper was retired with it; maintained terminal restoration tests remain in the regression inventory.

The control checkout also carries upstream 40145 command-admission wiring so its full PR checks exercise the same sent/refused command contract as the dynamically composed application. The release source receives that change through upstream ancestry. Newest-main conflict records preserve removal of the retired rail-outline test (legacy attribution is covered by the maintained hook suite) and keep the newest-card shortcut checks while honoring upstream sender-test removal.

Session-link translation subscriptions are owned by atomic 37744, and the hold-to-quit hint subscription is owned by 33512; their 11 overlay sections are removed.

`composed-reactive-copy.patch` follows the current renderer translation subscription contract: component render paths use `useTranslate`/`useIntlLocale`, and pure formatting helpers accept those dependencies. It also replaces the UI-only link polling interval with `installWindowVisibilityInterval`; host-side agent turns and delivery continue independently when the window is hidden. Child-history pagination and visibility-aware polling now live in atomic 34895, along with the canonical coalesced-poll runner import; both former overlay blocks are removed after a reverse-patch proof. Move these corrections into their owning atomic feature branches during cleanup, then remove this overlay. After upstream grouped launch/status modules, this overlay also retargets retained catalog and agent-icon imports (and their test mocks) to the current concrete owners. These compatibility-only changes must follow their feature code into the atomic branches during that cleanup; they do not recreate the removed catalog barrel.

The collaboration branch removes the unused compact-link label from English source and its runtime subset, and regenerates the protected-copy list. Its former localization-cleanup overlay is retired. Before applying the sparse Russian overlays, `fork-localizations.mjs` removes translations without a current English source by key, reusing the existing CLDR plural resolver to preserve Russian forms. Every removed key is recorded in the plan; stale overlay keys still block publication. This avoids patch-context dependence on frequently reordered locale catalogs.

The OpenCode worker entry extraction also moves its two existing startup filesystem references from `session-scanner-opencode-sqlite-worker-spawn.ts` to `session-scanner-opencode-sqlite-worker-entry.ts` in `main-sync-fs-baseline.txt`. The calls and total allowance are unchanged; `composed-ci-contracts.patch` records the path relocation, not an additional exception. Remove the entry when worker startup no longer needs synchronous bundle discovery.

Desktop personal versions use the next patch after the latest published stable upstream release, rather than the placeholder in main's package.json. The planner freezes the release id, tag, publication time and derived version base alongside the latest main commit and includes them in the fingerprint. An unavailable or invalid release blocks planning; it cannot silently fall back to a misleading package version. The updater guard remains active for all fork-preview bases. Fork compatibility CI fetches upstream release tags locally so historical-journey tests do not depend on the fork mirroring every tag.

The native ConPTY breakaway smoke owns an isolated Vitest worker: native addon state is not part of the shared-worker reset contract. Every smoke assertion remains enabled.

Paired desktop collaboration: the session-link feature now reads and mutates through the owning chat runtime. Its paired-desktop capability is separate from local-window support; CLI identity and unproven client metadata cannot become owner authority. Existing same-host links are visible from a paired Windows/Linux/macOS desktop, with no cross-host pairing or local fallback. Native mobile link controls remain outside this change. The Russian host-description key is included only in the fork localization layer.

The combined E2E reader graph additionally reaches React Native globals when mobile dependencies are installed. The integration type boundary declares only the Platform/AppState/selection-event interfaces used by those readers, preserving Node timer types in desktop tests. Native mobile type checking retains the real React Native declarations. No type-error baseline is increased. Upstream main by itself remains clean; this is a selected-combination boundary correction.

Current-upstream follow-up: sidebar catalog imports and reactive row copy now live in atomic 33361; their three duplicate overlay sections are removed. The external rename feature remains adapted by the existing fork supplement.

The existing client width preference now applies at the common Settings content container in atomic 40638: Comfortable, Wide and Full behave consistently across every page and search results. Its English description is owned by the upstream feature; the Russian description stays in the fork localization layer. No remote-server preference or new protocol is introduced.

## Release history

The personal workflow retains previous releases and rollback refs. The status issue points to the latest release that finished both promotion and publication. See [the release procedure](MAINTENANCE.md#release-and-recovery) for draft recovery.

Atomic 34895 owns the terminal delivery/pending projection and command-marker hooks extracted from its enlarged view. Their three duplicate sections are removed from `composed-source-modules.patch`; source line budgets are unchanged. Its session-children RPC and the collaboration RPCs declare their access through the current upstream method factory while retaining existing authorization and mail boundaries.

Sparse Russian overlays normally add missing translations. A changed existing string uses an optional `localizations/desktop-ru-base.json` (or mobile equivalent) containing only the reviewed previous values. Every base key must have an overlay replacement. The existing strict three-way catalog merge accepts the expected old value or an already-identical replacement and blocks divergent upstream translations; the plan records the base digest. The shared chat/Settings width description uses this guarded path.

Atomic 33502 now owns the mobile project section header, rename mutation and sidebar ordering indexes. Their six duplicate sections are removed from `composed-source-modules.patch`; line budgets and behavior are unchanged.

Merged 41114 supplies the localized one-line Used/Left heading. Its final accepted scope omits the owner-requested full-width account identity and single-line reset countdown layout. `account-usage-row-layout.patch` retains only those existing internal-build presentation details in the three account-row components; it preserves the accepted heading fix. The patch contains no quota-fetching logic. Owner-scoped remote account usage is a separate atomic change (issue 41536).

## Native Linux packages

The frozen plan contains one strict target matrix for all eleven requested package formats. Linux x64 uses an x64 runner, and Linux ARM64 uses an ARM64 runner. Both package the upstream AppImage, DEB and RPM targets, retaining upstream native/ABI checks, glibc 2.31 support and the packaged PTY round-trip in Ubuntu 20.04. Linux is also exercised for control pull requests before merge; those runs cannot publish or promote branches.

Each Linux format is extracted and measured against the source receipt and unpacked application. The shared application manifest must match across formats; only the verified format marker and the upstream AppImage-only pinned Node payload differ. A second native runner independently checks architecture, ABI floor, all archive contents and hashes. Both verified slices are mandatory in the final assembler and release ledger. Missing formats, altered receipts or changed bytes block publication and preserve the previous release.

This addition preserves the existing macOS ARM64, Windows x64 and Android signing policies. Intel macOS expansion remains separate; no iOS signing credentials are introduced. Account names, session control and live providers are never exercised by packaging.

The refresh on upstream 042c4516efa75bc83bba339d95bb8dcacfbdf004 retires only the project-start overlay adjustment to `worktree-creation-chat-handoff.test.tsx`, deleted upstream at 85f8ff358eb44ff0d7f877d91b5f80243e504012. That adjustment changed a fake Terminal region and the selector asserting that same mock; it added no real UI test case. Workspace-start implementation and its real component regressions remain selected. Other new assertions stay protected by the strict fixture-retirement policy.

The dynamic host-model report regression follows merged 41512: the next-turn picker and captured message keep the selected model when answering-model metadata changes. The test observes and flushes the new host report before checking the unchanged selection. Its current module imports now live in the same patch as the test; the later duplicate import-retarget section is removed. The working-picker assertion keeps the upstream selected-model contract with the Next turn label from 34866.

The combined host facade reuses the existing restart/resume factory return type, as its other collaborator fields already do. Removing the redundant type-only import keeps the class within the unchanged 300-line limit; runtime statements and public behavior remain unchanged.

Large source-refresh merges run the same pre-commit tasks with at most two concurrent lint-staged groups. The hook still checks every staged file and runs every configured command; the cap avoids launching all argument chunks at once on a shared workstation.

The flaky-test ratchet uses the same bounded 64 MiB Git-output buffer as the adjacent ratchet tooling. This accommodates the full changed-path inventory of a source-refresh merge; changed-file scope and every finding remain enforced.

The journal range-plan regression pins its monotonic clock while asserting exact row batches and indexed SQL plans. It does not assert a wall-time budget; the production eight-millisecond slice remains unchanged. The child-provider exit regression waits for its existing terminal assertions on both asynchronous publication channels, without changing expected values or timeouts.

## Refresh on upstream 6d5af64e39ab (2026-11-16)

Where this section differs from the notes above, it is the current state.

A second pass the same day moved the composition to upstream `396f14d90436`: nine branches were merged with it, nine reviewed resolutions were re-recorded on its inputs, and `project-start-actions.patch` follows one moved import. Upstream PR 42954 is part of that snapshot.

Every selected branch that conflicted with this upstream was merged with it in its own branch, feature first, so the composition no longer carries direct upstream conflicts. The 252 earlier reviewed resolutions matched none of the refreshed inputs and were replaced by 41 records for conflicts between selected features.

Selection changes:

- PR 41859 is replaced by merged upstream PR 42954, which fixes the same mobile report controls with one fixed isolated document.
- PRs 36634 and 36945 are retained closed personal features: upstream closed issues 36633 and 36942 as not planned. PR 36634 now shows a tool call's input once: a diff or a lone command carries it, anything else gets one Input block.
- Foreign PR 40298 composes from `integration/saved-server-rename-40298`, where the rename is ported onto upstream's worker-backed environment store.
- PR 36593 follows PR 36634's rule for the full-command detail; its one differing assertion is corrected in `composed-ci-contracts.patch`.

Overlay changes:

- `composed-source-modules.patch` no longer extracts the orchestration settings group, the mobile message props, the notice copy or the draft-blank helper: those files fit their budgets without it. It gains the pending-pick extraction for the desktop option pickers.
- `runtime-environment-rename.patch` keeps only the offline `orca environment rename` command, the mutation-actions extraction and the protected copy keys; the store selection and rename handler now come from upstream and the integration branch.
- `composed-ci-contracts.patch` drops adjustments to suites upstream deleted and the line-budget workarounds that are no longer needed.
- `upstream-module-relocations.patch` re-homes the fork-only cases of two suites upstream deleted into small test files beside the code they cover.
- `project-start-actions.patch` removes one stale flaky-pattern baseline entry.

The November 16 refresh follows upstream module relocations through c7f83f4e1958 and includes turn-diff summary collapse from 43124. The regression inventory follows upstream retirements in 42978, 42999 and 43047; the retained-history folding and mobile reader-toggle suites remain required. The obsolete setup-retention fixture adaptation is removed because 43047 retired that original suite. All selected features and all eleven package outputs remain required.

## Refresh on upstream 60d912e1531e (2026-11-18)

This refresh retains all 67 selected changes and all eleven required package outputs. Upstream now supplies 41540 (owner-scoped remote account rosters) and 43788 (remote Codex credit resets). The mobile model slider, transcript reader position and turn-diff collapse remain selected.

Twenty-five conflicting branches were merged with upstream in their own fork branches. The later upstream question-card change is also merged into the session-collaboration branch: its heading and owner context use the upstream card header and scroll layout. The original foreign heads remain ancestors of their integration branches.

Combination records preserve both conversation preferences and project ordering, explicit model-default fences, queued-message steering, child transcript inspection, session-link owner questions and foreground task controls. Import-only corrections already present in refreshed atomic heads are removed from the compatibility patches after reverse-application checks. Remaining supplements follow current module owners. The two added empty-workspace startup regressions live in a focused suite; retired upstream fixture-maintenance changes are omitted. The final formatting correction is separate from semantic resolutions. The existing two React Compiler exceptions remain unchanged.

The final supplement uses async lstat for managed Claude history roots, resolves the native keyboard helper through its existing fail-closed spawn path, and registers the existing OpenCode SQLite utility entry in the worker-only graph. Removed sync-call allowances are pruned rather than retained as spare budget. Startup reads the saved account selection asynchronously before opening account readiness. Remote account pushes serialize asynchronous atomic writes and acknowledge the existing RPC after persistence completes. The two blocking-helper rows that the prior fork source needed are gone without a baseline entry: 37744 runs session-link SQL in its own worker thread (built like the bots DB worker, on a separate WAL connection to the orchestration database), and the saved-server rename shares one store-write helper with the existing pairing replacement.

The web bundle uses its pinned Terser build dependency for large esbuild outputs before hashing. Verified bundle bytes, excluding the approved fonts and locale catalogs, fell from 10,556,936 to 10,363,016 against the existing 10,485,760-byte limit. The native Metro build is unchanged. Full PR checks also required committed-state dialog exit copy and existing relay-index dispatch lint alignment.

The pin moved from 9c6d2ed1e799 to 60d912e1531e, the newest upstream commit the refreshed branches were merged with; an older pin turns every merged branch into a combination conflict. Fork master with terminal daemon protocol 57 (PR 90) is merged into this source, so the cross-version wire checks compare against the same protocol. The two formatting defects left by the upstream merges are fixed in their owning branches (33361 `SidebarHeader.tsx`, 33502 `workspace-options-menu-items.tsx`) rather than in an overlay. The two changed-code findings on this composition are fixed the same way: the unused held-footer binding in 33576 and the `import()` mock type in the 40980 integration branch.

The packaged Windows serve-switch check (D7) fails on this composition as it did on PR 87 and PR 90: after the driver creates a workspace from the seeded repository, `createTerminalTab` times out on its click (`tests/tools/win-update-e2e/app-driver.mjs:216`). The cause is not yet identified. It is not part of the aggregate PR gate and is tracked as its own fix, not as an overlay.

A second pass the same day moved the pin from 60d912e1531e to dca1a281a2b6, 64 upstream commits later. Upstream merged 39915 as a maintainer rewrite on newer upstream (83913b96904f), and the refreshed 33365 head descends from upstream 3bb9bcba317. Both carry upstream history newer than 60d912e1531e, which that pin cannot compose. The refreshed 33360 (rebuilt on the ACP-provider template) and 33361 heads need no overlay change.

Five branches conflicted with the new pin and were merged with it in their own branches, feature first. 33362 keeps the prompt-keyed async answer operation from 44024. 33371 keeps the Claude account-selection handler from af8b7eea614 beside its usage-history facade. 33512 keeps the localized Quit label from 44097 in its hold-to-quit item. 33576 keeps the automation-turn marking, and 42410 keeps the Codex command environment. Three defects found during these merges are fixed in their branches: 33512 now imports the keyboard helper from its upstream location, so `upstream-module-relocations.patch` loses those two sections. The 33576 transcript-rows test now passes the scope key the hook requires, and two 33576 files are back within the 300-line limit with unchanged behavior. The composed typecheck and regression suites found three more test defects. 34365, 36634 and 43124 were merged with the pin and their tests fixed in separate commits. The photo-picker diagnostics bridge stubs the app-presence hook upstream added, and the tool-result test mocks the automation-mark icons the upstream message renderer now loads. The item-note cluster turn diff carries the turn key 43124 requires; this web typecheck error was already present on 60d912e1531e.

Six combination records were re-recorded because upstream or the new 33361 head changed one side: two for 33383, two for 33502, one for 37744 and one for 38963. Records that matched no input on this pin were removed with their patch files, leaving 41. The mobile overlay drops `chat.contextUsage.deferredTitle` and `deferredDescription` from the old 39915; upstream now ships English and Russian `deferredNote`. The composition has no conflicts or blockers. It passes local qualification, the desktop, CLI and mobile typechecks, and the composed regression suites: 174 desktop and 32 mobile pass, one desktop suite is skipped.

End-to-end runs against the dca1a281 composition exposed three defects owned by the explicit empty-workspace overlay. Closing a workspace's last tab still returned to the welcome page even though entry seeds no shell, so a file opened from the explorer took its workspace away when it closed. `project-start-actions.patch` now keeps an emptied workspace selected on its start page for terminal, editor, browser and split-group closes, with a focused store test. The upstream passive-seeding cases that returned in `initial-terminal-structured-launch.test.tsx` are retired again; their explicit-action counterparts stay in the overlay's own suite. The Windows serve-switch driver opens the start page's New Terminal when a setup-only create shows it. This was the D7 cause: PR 33361 carried an explicit terminal step through a New Terminal menu item that the current create row no longer renders. That branch now waits for the seeded terminal as upstream does.

The full PR checks on this composition then found eight line-budget overruns, one unused import and five upstream suites that the composed regression suites do not cover. Its orcad template inventory mismatch came from the duplicated usage-scan worker entry that 33371 has since removed. Each branch-owned cause is fixed in its branch with budgets unchanged. 37744 assembles its link commands with the CLI command list, reads background admission through the host's public session reads and fits one helper signature on a line, so the CLI orchestration spec, bot request sender and session host stay within 300 lines. 38963 names the host's restart-resume field through its factory, so that `composed-source-modules.patch` section is removed. 33369 moves the remote launch preflight method into its own module, 33361 moves the conversation row open beside the row chat actions, and 33363 and 34480 keep the mobile message row within 400 lines; 34480 also drops an unused import. 33371's push-startup suite mocks the profile usage history it does not model. 33417 keeps inline image chips for editors that opt into them, as the bot comment box does, and its legacy-draft migration no longer flattens agent and bot pills. 33383's bots render check opens the advanced workspace view, which its conversation-first host screen moved.

Two overruns exist only in the combination, so `composed-source-modules.patch` gains two extractions. Saving the project order leaves the UI preference slice, which 33361 and 33502 fill together. The AI Vault list reuses its parsed host for the scan fingerprint, which keeps the file that 33361, 33383 and `startup-chat-catalog.patch` extend within 300 lines. Upstream expects Close on a sole empty split chooser to leave the workspace, so `project-start-actions.patch` now does that again; closing a workspace's last tab still keeps its start page. The fork regression inventory now names 33360's two current Gemini suites; its rebuild on the ACP-provider template replaced the four it listed. The two `# PROPOSED REVIEW` blocking-helper rows still fail that ratchet until the owner decides on them.

New upstream slices 44450 (mobile reader, from 33576), 44451 (desktop model Default, from 33395) and 44452 (mobile subagent view) are held in `exclude` for this composition: each overlaps a selected parent PR and needs stacking or a combination check. They are selected in the next refresh.

The changed e2e shards on this composition failed four upstream specs. Two waited for the shell that workspace activation no longer seeds: the paired-client project removal spec and the repeated background-resize column check each opened a workspace that now shows its start page. `project-start-actions.patch` adds one e2e helper that clicks the start page's New Terminal when the active workspace has no terminal tab, and both specs call it with their assertions unchanged. The other two fail the same way on plain upstream dca1a281 and stay unchanged. The floating-tab rename spec looks for the sidebar search button by its label from before bots, which are on by default. The folder keyboard navigation spec clicks a row that the setup-script prompt covers in CI's 1280x1024 window.

## Refresh on upstream 7ade3e9b7718 (2026-11-19)

The pin moved from dca1a281a2b6 to 7ade3e9b7718, upstream main 234 commits later. Upstream merged test PR 44481 as 288943d457b1 after rebasing it on newer main, which the old pin cannot compose; 39915 (83913b96904f) is also in the new pin. All selected changes and all eleven package outputs remain required, and 44450, 44451 and 44452 stay held. 44655, opened during this refresh on newer upstream main, is held for the next one.

Fork master now carries terminal daemon protocol 60 from fork PR 91, which cherry-picks upstream 43707, 41917 and 43896 with their tests. Master is merged into this source, so the runtime launcher ratchet compares protocol 60 with 60 while this composition changes the runtime launcher files.

Ten branches conflicted with the new pin and were merged with it in their own branches, feature first: 33361, 33383, 33395, 33417, 33576, 34895, 37744, 41381, 43124 and the 40980 integration branch.

- 33361 follows upstream's indexed history-row ownership lookup and still lets only this host's chats own its history rows.
- 33383 combines its single-conversation history with upstream's History agent filter, sort and restart offer. The scope switch and filters move into one small component, so the panel stays within 400 lines.
- 33395 keeps the model-default reset beside upstream's CLI update row.
- 33417 moves its pill selection beside the pill list, and 33576 moves the waiting-row projection into its own module, so both stay within their line limits. 33576 also passes the resolved prompt that upstream's fold rows now take.
- 34895 passes upstream's approval target where it renders the worker approval timeline.
- 37744 renders upstream's new async question fixture through its questions slot.
- 40980 keeps upstream's promise-based listing errors with its account-aware sign-in mapping, now in its auth-error module.
- 41381 drops the back button that upstream replaced with the sheet header's.
- 43124 keeps its single-row turn-diff estimate with upstream's one status row for opened pull requests.

The composed checks found three single-PR defects. Each is fixed in its own branch after merging that branch with the pin. 41166 keeps mobile's own CLI-too-old wording, because upstream reworded the shared desktop default it reuses. 33360 lists Gemini in upstream's now-exhaustive chat-agent skill profiles with no folder scan, as before. 33502 gates its personal-opening capture inside its helper, so the worktree actions hook stays within 300 lines.

Nine combination records were re-recorded, as described in the merge-resolutions README. The mobile notice-row section of `composed-source-modules.patch` is re-rolled around upstream's setup-failure lines.

The relay two-path failover test that failed on PR 88 is an upstream flake, fixed by upstream 44236 in this pin. No selected PR touches the relay.

The changed e2e specs on this composition failed two upstream specs that fail the same way on plain upstream 7ade3e9b7718. No selected PR touches the rows they check or the specs themselves. `composed-ci-contracts.patch` adapts both until upstream updates them:

- Upstream 44417 turned the automation result note into a status row named `Scheduled · Morning digest · Finished`, but `bot-automation-result-note.spec.ts` still looks for `Morning digest. Finished`. The spec now follows the new row name.
- Upstream 44421 removed the Reply button from a bot item's open question, but `bot-item-view-width.spec.ts` still measures it. The spec now checks the comment box's submit button, which is the pane's rightmost control.

Locally the composition passes qualification, the desktop, CLI, web and mobile typechecks, and the blocking-helper ratchet with no baseline rows. Lint passes except the test-runner list check, which needs the control files. The composed regression suites pass: 180 desktop with 1 skipped, and 32 mobile.

## Refresh on upstream 0bd39bd4dcce (2026-11-19)

The pin moved from 7ade3e9b7718 to 0bd39bd4dcce, upstream main 113 commits later. Terminal daemon protocol is 60 on both sides, so no protocol adoption is needed. The plan resolves 70 changes: upstream supplies 29 and the fork composes 41. All eleven package outputs remain required.

Selection changes:

- 44450 (parked phone reader, from 33576), 44452 (mobile subagent view) and 44655 (Activity rows name the project) are selected. 33576 is stacked on 44450 (`"33576": [44450]`): its branch merges 44450, keeps 44450's place-keeper anchor unchanged and runs its own window update before it, so the two compose without a recorded resolution. 33576 keeps the rest of its phone reader: history-fold retention, reading place, waiting rows, the reader toggle, page list, tail follow and the touch growth hold, which builds on upstream 36949.
- 44451 (desktop Default slice of 33395) stays held. A restack of 33395 onto it was prepared but not published, because it changes 33395 behaviour: an accepted reset clears the new-chat model even after the view moved, the desktop Default row loses its model description, the mobile picker no longer forces the model row settable or says "Default model not reported", and an unstarted Default chat no longer snapshots the configured default. 33395 composes from its own head merged with the pin until the owner decides.
- 44768 is held: it is based on upstream db07b71ab7c, newer than this pin.
- `seed` gains 44450, 44451, 44452 and 44655. During this refresh GitHub search and the PR list returned only 13 of the owner's open PRs, which would otherwise hide new PRs from planning.

Nine branches conflicted with the pin and were merged with it in their own branches, feature first:

- 33363 and 33512 keep both sides' new translation keys.
- 33371 keeps its own host scope in Stats & Usage; upstream's checking state belongs to the wrapper 33371 replaced.
- 33395 keeps its model-default reset beside upstream's CLI-update catalog hook.
- 33576 carries upstream's merged quiet rows into its waiting-rows module.
- 34895 follows upstream 44423, where each subagent is one status row: the open button falls back to child navigation, and worker rows keep their state label and details.
- 37744 keeps upstream's orchestration-reader worker beside its session-link worker in every build list, and shows the link title on upstream 44440's phone status rows and queued senders.
- 41166 keeps the mobile failure copy out of the runtime catalog; mobile reads the shared defaults, which upstream also extended.
- 44452 adds the open action to upstream 44440's subagent rows, moves its state helpers into its own module and stays within the controller's 300-line limit.

The 40298 integration branch merges the foreign author's new head (0dce50cb31d7), which requires the stored pairing to match before a rename writes back.

Four new combination records: three for 44452 beside 38963 (overlay host, background task strip, row overlays host) and one for 33395's options hook beside 33362, which replaces `refresh-7ade-33395-1`. 44 records remain.

Overlay changes:

- `preview-updater-guard.patch` also blocks upstream 44541's automatic download, install and setting re-apply in fork previews.
- `composed-source-modules.patch` prunes the three compiler baseline rows the composition improves: the confirmation dialog (now 3 upstream), the link routing preference dialog and 44655's trimmed hover card summary.
- `composed-source-modules.patch` also moves the queued-message composer value into a hook beside its context. 38963's foreground task provider and 44452's subagent view together put the phone chat overlay over its 400-line limit; each fits alone.
- `composed-ci-contracts.patch` keeps both e2e spec adaptations; upstream has not updated those specs by this pin.

## Refresh on upstream 75339dcf434f (2026-11-21)

The pin moved from 0bd39bd4dcce to 75339dcf434f, upstream main 743 commits later. The plan resolves 78 changes: upstream supplies 32, the fork composes 45 PRs and one fork-local feature. All eleven package outputs remain required.

Fork master carries terminal daemon protocol 61 from fork PR 94, which cherry-picks upstream 44920 with its tests. Master is merged into this source, so the runtime launcher ratchet compares protocol 61 with 61 while this composition changes the runtime launcher files.

Selection changes:

- 45027 replaces 44655 and 44991 replaces 44768; both merged upstream. 45385 merged and is supplied by upstream.
- 44451 (desktop Default) is selected, and 33395 is stacked on it (`"33395": [44451]`). 33395's branch merges 44451 and carries only the rest of the model-default reset.
- 45437 (When Claude flags a request) and 46107 (Russian desktop strings) are selected. A complete Russian phone catalog exceeds the 384 KiB that one host catalog reply carries (upstream 40519), so 46107 is desktop-only. 46187 serves a larger phone catalog in 384 KiB windows through `mobileWeb.bundle.localeCatalogRange`, and 46190 adds the complete Russian phone catalog on top of it (`"46190": [46187]`). Both are selected, and the Russian mobile overlay is now empty.
- Gemini CLI chat over ACP landed upstream in 45985 after this pin, and upstream closed 33360 and the maintainer carry-over 45983. 33360 is retained closed from `gentslava/upstream-gemini-acp` until the pin contains 45985; the next refresh records `"33360": 45985` in `replacements`. 45983 closed unmerged and has no selection entry.
- The fork-local feature `activity-row-project-only` (branch `fix/activity-row-project-only`) names only the project on Activity rows; upstream 45027 keeps the workspace name.
- `seed` gains 44768, 45385, 45437, 46107, 46187 and 46190.

Twenty branches were merged with the pin in their own branches, feature first: 33360, 33362, 33371, 33383, 33417, 33502, 33512, 33576, 34338, 34895, 34899, 37744, 38963, 39882, 41166, 42410, 44452, 45437, the 38848 retained branch and the 40980 integration branch. `fix/activity-row-project-only` merged the pin cleanly. The 33361, 33395 and 44451 branches were merged with the pin separately.

- 33360 adds Gemini beside upstream's Kiro in the ACP registry, setup commands, naming exclusions and agent profiles. Bots stay held back from Gemini only.
- 33371 hands its usage history invoker to the runtime through the desktop core, which upstream 45071 introduced.
- 33383 keeps its single-conversation history with upstream's History bottom bar and agent filter. Its empty-list states move into the load-state module.
- 33512 reads hold-to-quit settings through the native settings projection (45130) and keybindings from the desktop core. The keyboard helper path no longer checks for the file; the quit-chord watch fails closed at spawn.
- 34895's chat pane contexts move into one wrapper, and 34899's local accounts stream joins upstream's per-host owner accounts stream (44478).
- 37744 writes session-link mail on its worker connection without a sender Dispatch (44472). Its owner question uses upstream's question card look.
- 40980's integration branch keeps upstream's sign-in answer when a listing finds the agent signed out. Its host agy fixture declares the system prompt capability that upstream now requires.
- 34338's upload test finds the spinner by upstream's `loading-spinner` frame; upstream no longer spins the svg itself.
- 33576 gives upstream's quiet-turn loop test the scope key its history fold requires.
- 42410 builds the Pi visuals environment with upstream's helper and the shared inherited-folder list, so an inherited temporary folder is dropped as before.
- 45437 moves its setting into upstream's host-owned settings (`projectHostOwnedSettings`, `useHostSetting`).
- 33417, 34895, 37744, 38848, 38963, 44452 and 45437 extract or condense code so each file stays within its line limit on this pin.

The 40298 integration branch merges the foreign author's new head (fbaff164deb1). Its rename handler stays in its own module.

Combination records: 43 new `refresh-7533-*` records and 9 unchanged earlier records; 52 in all. The rest were removed.

Overlay changes:

- `project-start-actions.patch` routes the tab bar's creation policy through the workspace owner with upstream's host statuses. It also retires upstream's passive initial-terminal seeder with its test and the two seeding cases in the initial-surface performance suite.
- `composed-source-modules.patch` no longer carries the keyboard helper, the queued-message composer hook, the desktop option pending pick, the structured session tab strips or the saved-server rename test imports; branches now own them. It moves the phone notice line text into its copy module and the desktop picker's accessible name into its labels module. It also prunes the blocking-helper, sync-fs and compiler baseline rows that the composition improves.
- `composed-source-modules.patch`'s pending model send fixture imports the default-model capability from 44451's runtime capabilities module.
- `composed-ci-contracts.patch` keeps upstream's compiler baseline row for the owner usage hook, which keeps its lint suppression. It optional-chains `capture()` in 44451's model-default test, which becomes optional beside 33362.
- `composed-format.patch` formats the tool-line label import from the 36593 record.
- `conversation-project-order.patch` uses the neutral project names (Acme, Example) that 33361's tests now use.
- `project-start-actions.patch` retires upstream's `agent-launch-picker-rows.test.ts`, which checks the setup chat rows that this launch menu leaves out. `composed-ci-contracts.patch` checks the process start time with `isNonNegativeSafeInteger`, as fork master did, instead of upstream's cast.
- `fork-upstream-regressions.mjs` names the two model-default suites at their new paths.
- `composed-source-modules.patch` prunes the 13 SQLite blocking baseline rows for the OpenCode and Hermes scanners, which its utility process entry exempts.
- The Russian desktop overlay drops 85 keys that 46107 now translates.

Locally the composition passes qualification, the desktop, CLI, web and mobile typechecks, the React Compiler ratchet and the localization checks. Lint passes; the test-runner list check passes on the merged tree with the control files. The composed regression suites pass: 191 desktop with 1 skipped, and 32 mobile. The full PR checks pass on this composition. The phone web bundle builds and verifies, with the largest host catalog ru at 434,522 bytes in windows.
