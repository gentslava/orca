# Personal Orca builds

`main` is the upstream mirror. `master` contains the last successfully built application, the daily/manual workflow and this selection. There is no additional integration branch.

The workflow freezes fresh `stablyai/orca:main`, discovers all open main-targeted PRs by the configured authors (including drafts), and adds explicitly selected community PRs. `seed` and the persistent fork status issue retain previously selected PRs after closure. Closed unmerged PRs block publication until a replacement or a reasoned exclusion is recorded. Merged PRs are omitted only after their merge commit is proven to be in the frozen upstream.

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

Packages use ad hoc integrity signatures, without Developer ID/notarization. Download/install manually; the explicit `preview-updater-guard.patch` disables official desktop updates for this version namespace. This existing fork policy is a required, hash-recorded packaging correction, not an implicit import of old master features. Standard official builds are unaffected. The GitHub release tag identifies the configuration commit; `plan.json` identifies the composed application commit/tree. The source bundle contains the exact application source relative to its recorded upstream prerequisite.

The explicit `integration-module-boundaries.patch` keeps the selected combination within upstream file-size gates: catalog types use the existing contract, transcript tail rendering uses the existing transcript-items module, IPC initialization is reused, and test setup/scenarios move into domain fixtures. It also prunes the reduced flaky-pattern baseline and aligns native watcher waits and timeout rationale with the existing test gates. The community scrcpy touch payload uses checked property guards at its IPC boundary, preserving its existing validation without an unchecked cast. No file-size gate or assertion is relaxed. Patch application and the composed production build remain required.

Promotion preserves only the pinned fork workflow, pipeline scripts/tests, preview updater test and `AGENTS.md` over the built source. The promotion commit has the previous master and built source as parents; old application changes are never implicitly carried into the new composition. Both old branch identities are checked against the push advertisement. A concurrent update or a newer/divergent mirror blocks both updates without force-pushing. Audit-only, failed and unchanged-input runs do not promote. Configuration fingerprints use the controlled files rather than the master commit, so source promotion alone does not force another build.

Build jobs execute the composed source with read-only repository permissions and no publishing/signing secrets. Publication uses a separate fresh runner and trusted master scripts. It checks only artifacts from the same workflow run. Previous successful releases are never deleted or replaced.

## Editing selection

Edit `selection.json` on master. Keep community PR numbers in `include`, with a reason. Use `exclude` for a deliberate retirement/hold, `replacements` for reviewed closed-PR successor mappings, and `dependencies` when application order matters. Required compatibility corrections are listed explicitly. Pins and optional silent fallbacks are intentionally not supported: maintain compatibility in the actual atomic PR instead.

Tests run without application dependencies:

```sh
node --test config/fork-build/composition.test.mjs config/fork-build/status-record.test.mjs config/fork-build/promotion.test.mjs
actionlint .github/workflows/personal-build.yml
```

The old fork-upstream preview workflow remains available manually for recovery. Its automatic promotion schedule is retired when this workflow is installed, so two automation paths cannot race to update master.
