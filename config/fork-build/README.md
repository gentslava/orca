# Personal Orca builds

`main` is the upstream mirror. `master` contains the last successfully built application, the daily/manual workflow and this selection. There is no additional integration branch.

Generated integration, packaging and promotion commits use GitHub's standard `github-actions[bot]` identity. Original upstream and PR commits retain their authors. Integration subjects use `fork: integrate PR NUMBER`; the source SHA remains in the merge parent and build plan. Fork status reports use plain PR numbers without issue mentions or upstream URLs, so routine builds do not add cross-reference events to upstream discussions. Keep personal package and CI reports in this fork; upstream PRs describe and validate only their own changes.

The workflow freezes fresh `stablyai/orca:main`, discovers all open main-targeted PRs by the configured authors (including drafts), and adds explicitly selected community PRs. `seed` and the persistent fork status issue retain previously selected PRs after closure. Closed unmerged PRs block publication until a replacement or a reasoned exclusion is recorded. Merged PRs are omitted only after their merge commit is proven to be in the frozen upstream.

A deliberately retained closed PR must be listed in `retainClosed` with a nonempty reason. Its freshly resolved head is composed with the same identity and conflict checks as an open PR. Exclusion/replacement and retention cannot coexist for one PR. The narrower native selection fix in PR 36892 is superseded by PR 38022, which also protects the editor insertion magnifier after a physical-handset reproduction. No head is pinned in configuration.

Every selection is required. Dependencies are explicit PR-number arrays; ties use ascending PR numbers. No dependencies are inferred from titles or reviews. A moved PR head fails planning. Direct upstream conflicts and conflicts caused by the selected combination are reported separately. The diagnostic composition may continue after a conflict to list further failures, but cannot be packaged or published. An outdated compatibility patch is a blocker as well.

When every conflicted path is an English or Russian desktop/mobile translation catalog, composition attempts a strict three-way merge by key. Independent additions and unchanged-side removals are retained; different edits to one key, delete/edit races, duplicate keys and non-catalog values fail. Source-code conflicts require a reviewed integration patch in `merge-resolutions/manifest.json`: the path and all three Git blob identities must match exactly. The patch and resulting file are SHA-256 checked. This preserves atomic upstream PRs while recording the explicit corrections required only by their selected combination; changed or unknown preimages block publication. `plan.json` records each successful locale merge in `result.localeMerges`, with its PR number and exact paths. Every resulting catalog is also checked after text-clean merges; duplicate keys stop planning. See [the reviewed integration corrections](merge-resolutions/README.md) for the fork-only source resolutions.

## Operation

- Daily at 03:37 UTC, plus manual **Personal upstream + PR build** on `master`.
- `audit_only`: resolve lifecycle and test composition; never package.
- `force_build`: bypass reuse of an identical last successful composition.
- Persistent [status issue](https://github.com/gentslava/orca/issues/12): current report, lifecycle ledger, and last successful downloads.
- Each run retains plan/report artifacts for 14 days. Successful prereleases retain ARM64 DMG and ZIP, checksums, archive/app proofs, the source plan and a Git bundle. After successful independent package verification and release publication, a trusted job promotes the built application to `master` and its frozen upstream to `main` in one atomic fast-forward push.
- Required conflicts or failed checks preserve previous releases. No silent subset build or automatic substitution/closing of upstream issues/PRs.

The package lane builds/typechecks the production desktop/CLI/web/mobile resources and native helpers. Trusted verification independently re-extracts DMG/ZIP, checks ARM64, code signatures, embedded source/version identity, the app-tree manifest and package digests. It does not launch the application. Component/unit checks do not establish physical-device or provider acceptance.

Packages use ad hoc integrity signatures, without Developer ID/notarization. Browser downloads may acquire macOS quarantine even though the same locally built app starts normally. Install a verified personal release from an updated fork checkout using Node and GitHub CLI:

```sh
node config/fork-build/install.mjs --wait --launch
```

Run this from Terminal and quit Orca completely when prompted. The installer selects the last successfully promoted release, verifies GitHub asset digests, the embedded source/version/architecture and full app manifest, then copies without propagating quarantine. The existing app is retained as a backup; running bundles are never replaced. No Apple Developer membership or global Gatekeeper change is required for this local installation. Use `--release personal-RUN-ATTEMPT` to pin a release, `--destination /path/to/Orca.app` for another install location, or `--assets-directory /path/to/downloads` to use existing downloads with the same mandatory verification.

The explicit `preview-updater-guard.patch` disables official desktop updates for this version namespace. This existing fork policy is a required, hash-recorded packaging correction, not an implicit import of old master features. Standard official builds are unaffected. The GitHub release tag identifies the configuration commit; `plan.json` identifies the composed application commit/tree. The source bundle contains the exact application source relative to its recorded upstream prerequisite.

The explicit `integration-module-boundaries.patch` keeps the selected combination within upstream file-size gates. It reuses catalog contracts, transcript-items rendering and existing initialization owners, and moves combined test scenarios into domain fixtures. It retains shipped orchestration skill digests and aligns mobile theme imports and the effort-slider regression with their current owners. Fixes already present in upstream or refreshed atomic PRs are removed from this patch. No file-size gate or assertion is relaxed. Patch application and the composed production build remain required.

Promotion preserves only the pinned fork workflow, pipeline scripts/tests, preview updater test and `AGENTS.md` over the built source. The promotion commit has the previous master and built source as parents; old application changes are never implicitly carried into the new composition. Both old branch identities are checked against the push advertisement. A concurrent update or a newer/divergent mirror blocks both updates without force-pushing. Audit-only, failed and unchanged-input runs do not promote. Configuration fingerprints use the controlled files rather than the master commit, so source promotion alone does not force another build.

Build jobs execute the composed source with read-only repository permissions and no publishing/signing secrets. Publication uses a separate fresh runner and trusted master scripts. It checks only artifacts from the same workflow run. Previous successful releases are never deleted or replaced.

## Editing selection

Edit `selection.json` on master. Keep community PR numbers in `include`, with a reason. Use `exclude` for a deliberate retirement/hold, `replacements` for reviewed closed-PR successor mappings, and `dependencies` when application order matters. Required compatibility corrections are listed explicitly. Pins and optional silent fallbacks are intentionally not supported: maintain compatibility in the actual atomic PR instead.
The retired hovercard fixture correction (PR 37279) is supplied by merged PR 37276. The changed file was verified identical to upstream; the obsolete PR is closed and recorded as a replacement.

The noisy readable-transcript warning (PR 36858, issue 36856) is supplied by merged PR 37211. The current scanner reports a failure only for unreadable conversations. The retired PR’s separate older-host disclosure enhancement is omitted from the required product build.

Mobile media lifecycle: PR 36922 in upstream supersedes PRs 36569 and 36574 by reserving four of the existing 64 bridge slots for native verbs. PR 36572 is retired because shipped shells install their channel per document, rather than replacing it inside a live document. These lifecycle decisions retain the historical Attach Photos investigation; they do not claim its original handset failure was reproduced or fixed.

Mobile queue lifecycle: merged PR 36928 supersedes PRs 36606 and 36607 for the excess blank scroll range and translated Save/Cancel sizing. Both retired PRs resolve to that successor; composition verifies its merge commit is in the current upstream instead of reapplying their older implementations. PR 36927 independently fixes the Auto agent default on desktop in upstream.

Tests run without application dependencies:

```sh
node --test config/fork-build/selection-retained.test.mjs config/fork-build/composition.test.mjs config/fork-build/status-record.test.mjs config/fork-build/promotion.test.mjs
actionlint .github/workflows/personal-build.yml
```

The old fork-upstream preview workflow remains available manually for recovery. Its automatic promotion schedule is retired when this workflow is installed, so two automation paths cannot race to update master.

The explicit `conversation-project-order.patch` connects conversation navigation (#33361) to personal project order (#33502). Desktop views reuse one four-mode menu. The paired mobile conversation list reads the same stored opening statistics and gates unsupported modes; manual order also covers empty project placeholders. The patch preserves folder/history-only group ordering. It is fork-only integration glue while those atomic upstream features are reviewed independently. A changed preimage blocks the build.

The explicit `settings-owner-relocations.patch` reconnects the selected skill, orchestration and quota views to their current settings owners after upstream relocations. It changes imports only. The explicit `model-fallback-next-turn-test.patch` adapts the upstream fallback interaction regression to the busy picker label supplied by the queued-send feature. Default selection and actual-model display are covered together in PR 33395. Unknown patch preimages block composition.

The explicit `reviewed-merge-target-paths.patch` classifies the exact reviewed merge manifest as external-source data for the generic path-literal check. Its paths belong to the composed Git tree and may precede the next promoted application in this control checkout. The mandatory three-blob, patch-digest and result-digest checks remain authoritative; ordinary CI/script paths remain checked. No path-literal baseline is expanded.

The explicit `startup-chat-catalog.patch` lets the combined desktop/mobile conversation navigation show durable chat records before provider transcript scans finish. Its catalog-only read bypasses transcript discovery and result caches, while the normal history request still enriches the list. Mobile uses the advertised capability; older hosts retain their existing history flow. The same atomic correction is present in the fork application source, and the required overlay preserves it when rebuilding from upstream and the selected PRs.

Claude fallback lifecycle: merged PR 37958 supersedes PR 37861, including separation of response observations from saved model preferences. The old fallback integration resolutions are removed. Merged PR 37968 supplies compact orchestration cards; PR 33403 now carries only human-authored chat navigation and preserves upstream card rendering on desktop and mobile. The merged successors are required by number and ancestry, without head pins.
