# Personal Orca builds

`main` is the upstream mirror. `master` contains the last successfully built application, the daily/manual workflow and this selection. There is no additional integration branch.

Generated integration, packaging and promotion commits use GitHub's standard `github-actions[bot]` identity. Original upstream and PR commits retain their authors. Integration subjects use `fork: integrate PR NUMBER`; the source SHA remains in the merge parent and build plan. Fork status reports use plain PR numbers without issue mentions or upstream URLs, so routine builds do not add cross-reference events to upstream discussions. Keep personal package and CI reports in this fork; upstream PRs describe and validate only their own changes.

The workflow freezes fresh `stablyai/orca:main`, discovers all open main-targeted PRs by the configured authors (including drafts), and adds explicitly selected community PRs. `seed` and the persistent fork status issue retain previously selected PRs after closure. Closed unmerged PRs block publication until a replacement or a reasoned exclusion is recorded. Merged PRs are omitted only after their merge commit is proven to be in the frozen upstream.

A deliberately retained closed PR must be listed in `retainClosed` with a nonempty reason. Its freshly resolved head is composed with the same identity and conflict checks as an open PR. Exclusion/replacement and retention cannot coexist for one PR. The narrower native selection fix in PR 36892 is superseded by PR 38022, which also protects the editor insertion magnifier after a physical-handset reproduction. No head is pinned in configuration.

Retained closed PRs with `retainedHeadSources` use the explicitly named fork branch, because GitHub keeps a closed PR head frozen. Planning pins both the closed head and the current branch head, checks repository/ref identity and ancestry, and rejects missing, rewritten or concurrently moved branches. The plan and fingerprint preserve this provenance; no stale-head fallback is used.

Each feature is merged as its tree delta from its unique common ancestor with the frozen upstream. This prevents shared historical fork merges from undoing an earlier selection. The final integration commit retains the preceding composition and the original PR head as its two parents; temporary snapshot commits are not part of the published ancestry. This uses Git plumbing available at the supported baseline.

Every selection is required. Dependencies are explicit PR-number arrays; ties use ascending PR numbers. No dependencies are inferred from titles or reviews. A moved PR head fails planning. Direct upstream conflicts and conflicts caused by the selected combination are reported separately. The diagnostic composition may continue after a conflict to list further failures, but cannot be packaged or published. An outdated compatibility patch is a blocker as well.

When every conflicted path is an English or Russian desktop/mobile translation catalog, composition attempts a strict three-way merge by key. Independent additions and unchanged-side removals are retained; different edits to one key, delete/edit races, duplicate keys and non-catalog values fail. Source-code conflicts require a reviewed integration patch in `merge-resolutions/manifest.json`: the path and all three Git blob identities must match exactly. The patch and resulting file are SHA-256 checked. This preserves atomic upstream PRs while recording the explicit corrections required only by their selected combination; changed or unknown preimages block publication. `plan.json` records each successful locale merge in `result.localeMerges`, with its PR number and exact paths. Every resulting catalog is also checked after text-clean merges; duplicate keys stop planning. See [the reviewed integration corrections](merge-resolutions/README.md) for the fork-only source resolutions.

## Operation

- Daily at 03:37 UTC, plus manual **Personal upstream + PR build** on `master`.
- `audit_only`: resolve lifecycle and test composition; never package.
- `force_build`: bypass reuse of an identical last successful composition.
- Persistent [status issue](https://github.com/gentslava/orca/issues/12): current report, lifecycle ledger, and last successful downloads.
- Each run retains plan/report artifacts for 14 days. Successful prereleases retain ARM64 DMG and ZIP, Windows x64 installer and portable ZIP, Android APK, checksums, archive/app proofs, the source plan and a Git bundle. After successful independent package verification and release publication, a trusted job promotes the built application to `master` and its frozen upstream to `main` in one atomic fast-forward push.
- Required conflicts or failed checks preserve previous releases. No silent subset build or automatic substitution/closing of upstream issues/PRs.

The package lane builds/typechecks the production desktop/CLI/web/mobile resources and native helpers. Trusted verification independently re-extracts DMG/ZIP, checks ARM64, code signatures, embedded source/version identity, the app-tree manifest and package digests. It does not launch the application. Component/unit checks do not establish physical-device or provider acceptance.

Packages use ad hoc integrity signatures, without Developer ID/notarization. Browser downloads may acquire macOS quarantine even though the same locally built app starts normally. Install a verified personal release from an updated fork checkout using Node and GitHub CLI:

```sh
node config/fork-build/install.mjs --wait --launch
```

Run this from Terminal and quit Orca completely when prompted. The installer selects the last successfully promoted release, verifies GitHub asset digests, the embedded source/version/architecture and full app manifest, then copies without propagating quarantine. The existing app is retained as a backup; running bundles are never replaced. No Apple Developer membership or global Gatekeeper change is required for this local installation. Use `--release personal-RUN-ATTEMPT` to pin a release, `--destination /path/to/Orca.app` for another install location, or `--assets-directory /path/to/downloads` to use existing downloads with the same mandatory verification.

Promotion preserves only the pinned fork workflow, pipeline scripts/tests, preview updater test and `AGENTS.md` over the built source. The promotion commit has the previous master and built source as parents; old application changes are never implicitly carried into the new composition. Both old branch identities are checked against the push advertisement. A concurrent update or a newer/divergent mirror blocks both updates without force-pushing. Audit-only, failed and unchanged-input runs do not promote. Configuration fingerprints use the controlled files rather than the master commit, so source promotion alone does not force another build.

Build jobs execute the composed source with read-only repository permissions and no publishing/signing secrets. Publication uses a separate fresh runner and trusted master scripts. It checks only artifacts from the same workflow run. Previous successful releases are never deleted or replaced.

## Editing selection

Edit `selection.json` on master. Keep community PR numbers in `include`, with a reason. Use `exclude` for a deliberate retirement/hold, `replacements` for reviewed unmerged-PR successor mappings (effective before upstream closure), and `dependencies` when application order matters. Required compatibility corrections are listed explicitly. Pins and optional silent fallbacks are intentionally not supported: maintain compatibility in the actual atomic PR instead.
The retired hovercard fixture correction (PR 37279) is supplied by merged PR 37276. The changed file was verified identical to upstream; the obsolete PR is closed and recorded as a replacement.

Mobile shared-reader lifecycle: merged PR 39727 carries the same four-file patch as closed PR 39022. The replacement records that maintainer port; composition verifies its merge ancestry before omitting it from the personal build.

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

| File                                                                                             | Bailouts | Owning PR | Removal plan                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------ | -------: | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/src/components/native-chat/use-native-chat-transcript-row-keys.ts`                 |       12 | 33576     | Replace render-time committed-snapshot reads with an effect/ref boundary or an owner-style external store; remove this overlay baseline entry.                                                                        |
| `src/renderer/src/components/native-chat/conversation/slots/use-native-chat-transcript-slots.ts` |        2 | 33576     | Preserve fold/history state through the same committed-snapshot redesign; remove this overlay baseline entry.                                                                                                         |
| `src/renderer/src/components/stats/UsageHistoryDailyChart.tsx`                                   |        1 | 33371     | Make the first vertical chart slice compile cleanly by separating the member expression from its method call; retain a minimal reproduction if the compiler defect persists, then remove this overlay baseline entry. |

The removal work is recorded in [the atomic PR plans](atomic-pr-plans.md). The two history entries contribute 14 diagnostics, not 14 separate source files. They disappear together when PR 33576's redesigned history code compiles. The chart's single entry disappears when PR 33371's first slice compiles.

## Fork translations

Feature branches own English copy. Sparse Russian desktop/mobile catalogs live in `localizations/` and are applied only to composed fork source. Planning validates English keys, placeholders and duplicate keys, and rejects a different existing translation. The plan and build fingerprint record each overlay digest. Missing or stale overlays block publication.

## One source for macOS, Windows and Android

Every run resolves the latest upstream main and live PR heads once, then shares that exact plan and Git bundle across all three required package jobs. Windows and Android are independently extracted and verified on fresh trusted runners before the common release can be published. A failure on any platform blocks publication and promotion; the status issue names every result. No partial release or older-upstream fallback is automatic.

Windows uses the existing native build and electron-builder configuration with a fork-only unsigned x64 wrapper. No signing or publication secrets are available to the build jobs. Installer and ZIP must contain the same complete application tree, PE architecture, ProductVersion and embedded source receipt as the unpacked build. The updater preview guard also runs on Windows. Checksums are in `windows-SHA256SUMS`; use `Get-FileHash <download> -Algorithm SHA256` before installing the unsigned installer or extracting the portable ZIP. The macOS install script remains macOS-only.

Android uses the existing Expo/Gradle release path with the committed mobile version/code and existing Expo debug certificate. Production signing requirements block this debug lane rather than being bypassed. Its APK manifest, ARM64 libraries, signing certificate, source receipt and digest are rechecked on a fresh Linux runner. Checksums are in `android-SHA256SUMS`. The shared desktop version and mobile version are recorded separately. Neither static package verification nor CI claims real-device acceptance.

Replacement 36736 → 40148 adopts upstream account migration. The small `codex-selected-account-read.patch` retains only fail-closed unreadable Codex selection and its regression tests; Claude retains upstream behavior. The merged migration searches the target home first, preserving its existing rollout; absent targets still use the existing no-overwrite migration helper. Never-sent chats select their new home without requiring a saved rollout.

`composed-source-modules.patch` keeps the promoted fork eligible for the full PR checks without relaxing source budgets: chat list/message/send input contracts, the mobile section header, sidebar ordering indexes, rename mutation, command-marker ownership, pending delivery projection and restart/Stop wiring live in focused existing or adjacent domain modules. Markup, delivery ordering and public wire contracts are preserved. It also recognizes the existing `.test-harness` spelling alongside `-test-harness` in the test-only mocking policy. These corrections belong in their atomic feature branches during the planned cleanup; the composition overlay preserves them until then. No max-lines suppression or expanded budget is added.
