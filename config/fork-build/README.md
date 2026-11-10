# Personal Orca builds

`main` is the upstream mirror. `master` contains the qualified composed application, the daily/manual workflow and this selection. Source refreshes may land through a fully green pull request before packaging; the release ledger separately identifies the last successfully packaged application. There is no additional integration branch.

Generated integration, packaging and promotion commits use GitHub's standard `github-actions[bot]` identity. Original upstream and PR commits retain their authors. Integration subjects use `fork: integrate PR NUMBER`; the source SHA remains in the Source-Head trailer and build plan. Fork status reports use plain PR numbers without issue mentions or upstream URLs, so routine builds do not add cross-reference events to upstream discussions. Keep personal package and CI reports in this fork; upstream PRs describe and validate only their own changes.

The workflow freezes fresh `stablyai/orca:main`, discovers all open main-targeted PRs by the configured authors (including drafts), and adds explicitly selected community PRs. `seed` and the persistent fork status issue retain previously selected PRs after closure. Closed unmerged PRs block publication until a replacement or a reasoned exclusion is recorded. Merged PRs are omitted only after their merge commit is proven to be in the frozen upstream.

A deliberately retained closed PR must be listed in `retainClosed` with a nonempty reason. Its freshly resolved head is composed with the same identity and conflict checks as an open PR. Exclusion/replacement and retention cannot coexist for one PR. The narrower native selection fix in PR 36892 is superseded by PR 38022, which also protects the editor insertion magnifier after a physical-handset reproduction. No head is pinned in configuration.

Retained closed PRs with `retainedHeadSources` use the explicitly named fork branch, because GitHub keeps a closed PR head frozen. Planning pins both the closed head and the current branch head, checks repository/ref identity and ancestry, and rejects missing, rewritten or concurrently moved branches. The plan and fingerprint preserve this provenance; no stale-head fallback is used.

Each feature is merged as its tree delta from its unique common ancestor with the frozen upstream. This prevents shared historical fork merges from undoing an earlier selection. The final integration commit has only the preceding composition as its parent. Original PR branches and temporary merge snapshots are not imported into published ancestry. This uses Git plumbing available at the supported baseline.

Every selection is required. Dependencies are explicit PR-number arrays; ties use ascending PR numbers. No dependencies are inferred from titles or reviews. A moved PR head fails planning. Direct upstream conflicts and conflicts caused by the selected combination are reported separately. The diagnostic composition may continue after a conflict to list further failures, but cannot be packaged or published. An outdated compatibility patch is a blocker as well.

When every conflicted path is an English or Russian desktop/mobile translation catalog, composition attempts a strict three-way merge by key. Independent additions and unchanged-side removals are retained; different edits to one key, delete/edit races, duplicate keys and non-catalog values fail. Source-code conflicts require a reviewed integration patch in `merge-resolutions/manifest.json`: the path and all three Git blob identities must match exactly. The patch and resulting file are SHA-256 checked. This preserves atomic upstream PRs while recording the explicit corrections required only by their selected combination; changed or unknown preimages block publication. `plan.json` records each successful locale merge in `result.localeMerges`, with its PR number and exact paths. Every resulting catalog is also checked after text-clean merges; duplicate keys stop planning. See [the reviewed integration corrections](merge-resolutions/README.md) for the fork-only source resolutions.

## Operation

- Daily at 03:37 UTC, plus manual **Personal upstream + PR build** on `master`.
- `audit_only`: resolve lifecycle and test composition; never package.
- `force_build`: bypass reuse of an identical last successful composition.
- Persistent [status issue](https://github.com/gentslava/orca/issues/12): current report, lifecycle ledger, and last successful downloads.
- Each run retains plan/report artifacts for 14 days. Successful prereleases retain ARM64 DMG and ZIP, Windows x64 installer and portable ZIP, Android APK, checksums, archive/app proofs, the source plan and a Git bundle. After successful independent package verification and release publication, a trusted job promotes the built application to `master` and its frozen upstream to `main` in one atomic lease-protected push. Each selected PR contributes one linear commit over clean upstream main; original PR heads are recorded in commit messages and the build plan, not imported as parents. Required compatibility/localization corrections are folded into one commit. Promotion adds only the fork control commit, without the previous master as a parent. The replaced master is retained in an archive/master-<full-sha> branch in that same atomic push.
- Required conflicts or failed checks preserve the current verified release. No silent subset build or automatic substitution/closing of upstream issues/PRs.

Upstream mirror and source maintenance do not wait for hosted packaging capacity. A source refresh preserves upstream and feature ancestry and must pass the full pull-request checks before merge. Transient EOF, connection-reset, TLS-connection, timeout and HTTP 502/503/504 failures retry read-only GitHub metadata requests and Git fetch/ref discovery up to three times; pushes, API mutations and permanent failures are never retried automatically.

The package lane builds/typechecks the production desktop/CLI/web/mobile resources and native helpers. Trusted verification independently re-extracts DMG/ZIP, checks ARM64, code signatures, embedded source/version identity, the app-tree manifest and package digests. It does not launch the application. Component/unit checks do not establish physical-device or provider acceptance.

Packages use ad hoc integrity signatures, without Developer ID/notarization. Browser downloads may acquire macOS quarantine even though the same locally built app starts normally. Install a verified personal release from an updated fork checkout using Node and GitHub CLI:

```sh
node config/fork-build/install.mjs --wait --launch
```

Run this from Terminal and quit Orca completely when prompted. The installer selects the last successfully promoted release, verifies GitHub asset digests, the embedded source/version/architecture and full app manifest, then copies without propagating quarantine. The existing app is retained as a backup; running bundles are never replaced. No Apple Developer membership or global Gatekeeper change is required for this local installation. Use `--release personal-RUN-ATTEMPT` to pin a release, `--destination /path/to/Orca.app` for another install location, or `--assets-directory /path/to/downloads` to use existing downloads with the same mandatory verification.

Promotion preserves only the pinned fork workflow, pipeline scripts/tests, preview updater test and `AGENTS.md` over the built source. The promotion commit has only the built source as its parent; previous master history is retained in a separate archive branch. Both old branch identities are checked against the push advertisement. A concurrent update or a newer/divergent mirror blocks both updates. Only master may be replaced using its exact expected SHA lease, atomically with the archive backup; main must remain a fast-forward. Audit-only, failed and unchanged-input runs do not promote. Configuration fingerprints use the controlled files rather than the master commit, so source promotion alone does not force another build.

Build jobs execute the composed source with read-only repository permissions and no publishing/signing secrets. Publication uses a separate fresh runner and trusted master scripts. It checks only artifacts from the same workflow run. Previous successful releases are never deleted or replaced.

## Editing selection

Antigravity terminal model discovery is supplied by required PR 40175. It reads the execution host's `agy models` catalog separately from Chat's ACP catalog, so a terminal can offer Claude and GPT-OSS without advertising them for a managed Chat server that cannot run them. The change preserves account, host and mixed-version boundaries; it does not alter Google's ACP client restrictions or switch existing chats to another account/backend.

Edit `selection.json` on master. Keep community PR numbers in `include`, with a reason. Use `exclude` for a deliberate retirement/hold, `replacements` for reviewed unmerged-PR successor mappings (effective before upstream closure), and `dependencies` when application order matters. Required compatibility corrections are listed explicitly. Pins and optional silent fallbacks are intentionally not supported: maintain compatibility in the actual atomic PR instead.
The retired hovercard fixture correction (PR 37279) is supplied by merged PR 37276. The changed file was verified identical to upstream; the obsolete PR is closed and recorded as a replacement.

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

The old fork-upstream preview workflow remains available manually for recovery. Its automatic promotion schedule is retired when this workflow is installed, so two automation paths cannot race to update master.

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

## One source for macOS, Windows and Android

Every run resolves the latest upstream main and live PR heads once, then shares that exact plan and Git bundle across all three required package jobs. Windows and Android are independently extracted and verified on fresh trusted runners before the common release can be published. A failure on any platform blocks publication and promotion; the status issue names every result. No partial release or older-upstream fallback is automatic.

macOS packaging uses the standard `macos-26` ARM64 image. The separate trusted publisher uses `macos-26-intel`: archive verification reads the ARM64 binaries with `lipo` and `codesign`, without launching them, so it does not need an ARM64 runner. The native ARM64 build guard, target architecture check, signatures, full app-tree comparison and common publication gate still apply. Infrastructure retries rerun failed jobs and preserve successful platform packages.

Windows uses the existing native build and electron-builder configuration with a fork-only unsigned x64 wrapper. No signing or publication secrets are available to the build jobs. Installer and ZIP must contain the same complete application tree, PE architecture, numeric ProductVersion, full fork-preview FileVersion and embedded source receipt as the unpacked build. Build the NSIS installer first, then the portable ZIP from its completed unpacked tree with `--prepackaged`; NSIS adds `resources/elevate.exe` after an ordinary parallel ZIP target would already have captured the tree. The updater preview guard also runs on Windows. Checksums are in `windows-SHA256SUMS`; use `Get-FileHash <download> -Algorithm SHA256` before installing the unsigned installer or extracting the portable ZIP. The macOS install script remains macOS-only.

Android uses the existing Expo/Gradle release path with the committed mobile version/code and existing Expo debug certificate. Production signing requirements block this debug lane rather than being bypassed. Its APK manifest, ARM64 libraries, signing certificate, source receipt and digest are rechecked on a fresh Linux runner. Certificate reports accept the legacy numbered signer and current `V2 Signer:` labels, but require exactly one SHA-256 certificate line matching the pinned Expo identity; unknown or additional certificate lines are refused. Checksums are in `android-SHA256SUMS`. The shared desktop version and mobile version are recorded separately. A rejected APK is retained for three days as a diagnostic Actions artifact and cannot enter publication. Neither static package verification nor CI claims real-device acceptance.

Replacement 40499 → 40496 uses the identical upstream ACP restart digest repair; its merged ancestry is required before the duplicate fix is omitted.

The usage-history layout and cursor-adjacent day readout are owned by atomic 33371. Its reactive chart, breakdown, account-label and currency formatting corrections now live in that branch; their current-upstream import relocations also live in the atomic branch. The Skills action reuses its existing declared translation key.

Merged 33403 is supplied directly by upstream. Explicit selections 40297 and 40298 preserve the artifact Update-button layout and the saved-server rename requested in owner issues. The open rename implementation is included until upstream ships it. `runtime-environment-rename.patch` exposes the same store operation as an offline `orca environment rename --environment <selector> --name <name>` command; only this client's saved name changes, preserving pairing and identity. Its regression also protects opaque newer store records and redacted output. The supplement keeps store selection, IPC rename and web saved-record mutations in bounded modules and moves async cleanup outside React compilation; no compiler or line-count budget is relaxed. The Russian overlay also covers the General settings page, its destinations, search keywords and breadcrumb navigation.

Replacement 36736 → 40148 adopts upstream account migration. The small `codex-selected-account-read.patch` retains only fail-closed unreadable Codex selection and its regression tests; Claude retains upstream behavior. The merged migration searches the target home first, preserving its existing rollout; absent targets still use the existing no-overwrite migration helper. Never-sent chats select their new home without requiring a saved rollout.

`composed-source-modules.patch` keeps the promoted fork eligible for the full PR checks without relaxing source budgets: chat list/message/send input contracts, the mobile section header, sidebar ordering indexes, rename mutation and restart/Stop wiring live in focused existing or adjacent domain modules. Markup, delivery ordering and public wire contracts are preserved. It also recognizes the existing `.test-harness` spelling alongside `-test-harness` in the test-only mocking policy. These corrections belong in their atomic feature branches during the planned cleanup; the composition overlay preserves them until then. No max-lines suppression or expanded budget is added.

The timer-drain compatibility correction was retired after upstream 40512 removed its sole stalled-hidden-restore case. Its unused fixture helper was retired with it; maintained terminal restoration tests remain in the regression inventory.

The control checkout also carries upstream 40145 command-admission wiring so its full PR checks exercise the same sent/refused command contract as the dynamically composed application. The release source receives that change through upstream ancestry. Newest-main conflict records preserve removal of the retired rail-outline test (legacy attribution is covered by the maintained hook suite) and keep the newest-card shortcut checks while honoring upstream sender-test removal.

Session-link translation subscriptions are owned by atomic 37744, and the hold-to-quit hint subscription is owned by 33512; their 11 overlay sections are removed.

`composed-reactive-copy.patch` follows the current renderer translation subscription contract: component render paths use `useTranslate`/`useIntlLocale`, and pure formatting helpers accept those dependencies. It also replaces the two UI-only child/link polling intervals with `installWindowVisibilityInterval`; host-side agent turns and delivery continue independently when the window is hidden. Move these corrections into their owning atomic feature branches during cleanup, then remove this overlay. After upstream grouped launch/status modules, this overlay also retargets retained catalog and agent-icon imports (and their test mocks) to the current concrete owners. These compatibility-only changes must follow their feature code into the atomic branches during that cleanup; they do not recreate the removed catalog barrel.

The collaboration branch removes the unused compact-link label from English source and its runtime subset, and regenerates the protected-copy list. Its former localization-cleanup overlay is retired. Before applying the sparse Russian overlays, `fork-localizations.mjs` removes translations without a current English source by key, reusing the existing CLDR plural resolver to preserve Russian forms. Every removed key is recorded in the plan; stale overlay keys still block publication. This avoids patch-context dependence on frequently reordered locale catalogs.

The OpenCode worker entry extraction also moves its two existing startup filesystem references from `session-scanner-opencode-sqlite-worker-spawn.ts` to `session-scanner-opencode-sqlite-worker-entry.ts` in `main-sync-fs-baseline.txt`. The calls and total allowance are unchanged; `composed-ci-contracts.patch` records the path relocation, not an additional exception. Remove the entry when worker startup no longer needs synchronous bundle discovery.

Desktop personal versions use the next patch after the latest published stable upstream release, rather than the placeholder in main's package.json. The planner freezes the release id, tag, publication time and derived version base alongside the latest main commit and includes them in the fingerprint. An unavailable or invalid release blocks planning; it cannot silently fall back to a misleading package version. The updater guard remains active for all fork-preview bases. Fork compatibility CI fetches upstream release tags locally so historical-journey tests do not depend on the fork mirroring every tag.

The native ConPTY breakaway smoke owns an isolated Vitest worker: native addon state is not part of the shared-worker reset contract. Every smoke assertion remains enabled.

Paired desktop collaboration: the session-link feature now reads and mutates through the owning chat runtime. Its paired-desktop capability is separate from local-window support; CLI identity and unproven client metadata cannot become owner authority. Existing same-host links are visible from a paired Windows/Linux/macOS desktop, with no cross-host pairing or local fallback. Native mobile link controls remain outside this change. The Russian host-description key is included only in the fork localization layer.

The combined E2E reader graph additionally reaches React Native globals when mobile dependencies are installed. The integration type boundary declares only the Platform/AppState/selection-event interfaces used by those readers, preserving Node timer types in desktop tests. Native mobile type checking retains the real React Native declarations. No type-error baseline is increased. Upstream main by itself remains clean; this is a selected-combination boundary correction.

Current-upstream follow-up: sidebar catalog imports and reactive row copy now live in atomic 33361; their three duplicate overlay sections are removed. The external rename feature remains adapted by the existing fork supplement.

The existing client width preference now applies at the common Settings content container in atomic 40638: Comfortable, Wide and Full behave consistently across every page and search results. Its English description is owned by the upstream feature; the Russian description stays in the fork localization layer. No remote-server preference or new protocol is introduced.

## One current internal release

The fork keeps one published release: the latest fully verified multiplatform build, after successful master/main promotion and the persistent last-good ledger update. The trusted status job then deletes older published releases and their assets. Failed, audit-only, reused or unpromoted runs cannot trigger cleanup. Draft releases are left alone; a newer published release or changed live ledger blocks deletion. Git tags and source/archive branches are retained. The cleanup receipt records each deletion as it succeeds and is retained as an Actions artifact for 14 days; a failed deletion stops cleanup without retrying mutations.

PR screenshots belong in GitHub user-attachments, not separate evidence releases. Historical binary download links expire when the next verified release replaces them; the status issue always links to the current verified release.

Atomic 34895 owns the terminal delivery/pending projection and command-marker hooks extracted from its enlarged view. Their three duplicate sections are removed from `composed-source-modules.patch`; source line budgets are unchanged. Its session-children RPC and the collaboration RPCs declare their access through the current upstream method factory while retaining existing authorization and mail boundaries.

Sparse Russian overlays normally add missing translations. A changed existing string uses an optional `localizations/desktop-ru-base.json` (or mobile equivalent) containing only the reviewed previous values. Every base key must have an overlay replacement. The existing strict three-way catalog merge accepts the expected old value or an already-identical replacement and blocks divergent upstream translations; the plan records the base digest. The shared chat/Settings width description uses this guarded path.
