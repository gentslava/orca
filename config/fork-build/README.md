# Personal Orca builds

`main` is the upstream mirror. `master` owns the daily/manual workflow and this selection. There is no additional integration branch.

The workflow freezes fresh `stablyai/orca:main`, discovers all open main-targeted PRs by the configured authors (including drafts), and adds explicitly selected community PRs. `seed` and the persistent fork status issue retain previously selected PRs after closure. Closed unmerged PRs block publication until a replacement or a reasoned exclusion is recorded. Merged PRs are omitted only after their merge commit is proven to be in the frozen upstream.

Every selection is required. Dependencies are explicit PR-number arrays; ties use ascending PR numbers. No dependencies are inferred from titles or reviews. A moved PR head fails planning. Direct upstream conflicts and conflicts caused by the selected combination are reported separately. The diagnostic composition may continue after a conflict to list further failures, but cannot be packaged or published. An outdated compatibility patch is a blocker as well.

## Operation

- Daily at 03:37 UTC, plus manual **Personal upstream + PR build** on `master`.
- `audit_only`: resolve lifecycle and test composition; never package.
- `force_build`: bypass reuse of an identical last successful composition.
- Persistent [status issue](https://github.com/gentslava/orca/issues/12): current report, lifecycle ledger, and last successful downloads.
- Each run retains plan/report artifacts for 14 days. Successful prereleases retain ARM64 DMG and ZIP, checksums, archive/app proofs, the source plan and a Git bundle. No application source is promoted back to master by this workflow.
- Required conflicts or failed checks preserve previous releases. No silent subset build or automatic substitution/closing of upstream issues/PRs.

The package lane builds/typechecks the production desktop/CLI/web/mobile resources and native helpers. Trusted verification independently re-extracts DMG/ZIP, checks ARM64, code signatures, embedded source/version identity, the app-tree manifest and package digests. It does not launch the application. Component/unit checks do not establish physical-device or provider acceptance.

Packages use ad hoc integrity signatures, without Developer ID/notarization. Download/install manually; the explicit `preview-updater-guard.patch` disables official desktop updates for this version namespace. This existing fork policy is a required, hash-recorded packaging correction, not an implicit import of old master features. Standard official builds are unaffected. The GitHub release tag identifies the configuration commit; `plan.json` identifies the composed application commit/tree. The source bundle contains the exact application source relative to its recorded upstream prerequisite.

Build jobs execute the composed source with read-only repository permissions and no publishing/signing secrets. Publication uses a separate fresh runner and trusted master scripts. It checks only artifacts from the same workflow run. Previous successful releases are never deleted or replaced.

## Editing selection

Edit `selection.json` on master. Keep community PR numbers in `include`, with a reason. Use `exclude` for a deliberate retirement/hold, `replacements` for reviewed closed-PR successor mappings, and `dependencies` when application order matters. Required compatibility corrections are listed explicitly. Pins and optional silent fallbacks are intentionally not supported: maintain compatibility in the actual atomic PR instead.

Tests run without application dependencies:

```sh
node --test config/fork-build/composition.test.mjs config/fork-build/status-record.test.mjs
actionlint .github/workflows/personal-build.yml
```

The old fork-upstream preview workflow remains available manually for recovery. Its automatic promotion schedule is retired when this workflow is installed, so two automation paths cannot race to update master.
