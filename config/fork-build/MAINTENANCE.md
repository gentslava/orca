# Maintaining the Orca fork

## Branches and authority

- `stablyai/orca:main` supplies the upstream application.
- `gentslava/orca:main` mirrors the upstream SHA used in the latest promotion.
- `gentslava/orca:master` contains the verified composition plus fork control files. Pull requests for maintenance target this branch. Use an isolated checkout based on its live remote head.
- [selection.json](selection.json) defines which features the build requires. [Issue 12](https://github.com/gentslava/orca/issues/12) tracks selected PRs across closures and records the last verified, promoted release.
- [personal-build.yml](../../.github/workflows/personal-build.yml) is the scheduled and manual release entry point. The separate macOS preview workflow is for diagnostics and uploads its result to Actions.

## Start an update

Read [AGENTS.md](../../AGENTS.md). Use Node 24, Git, GitHub CLI and the upstream package manager from the committed `packageManager` field. Check the authenticated account and refresh the named refs.

```sh
gh auth status
git fetch --no-tags upstream +refs/heads/main:refs/remotes/upstream/main
git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main +refs/heads/master:refs/remotes/origin/master
git rev-parse upstream/main origin/main origin/master
git rev-list --left-right --count origin/master...upstream/main
git rev-list --left-right --count origin/main...upstream/main
git log --first-parent --oneline origin/main..upstream/main
git diff --stat origin/main upstream/main
gh issue view 12 -R gentslava/orca
gh run list -w personal-build.yml -R gentslava/orca
gh pr list -R stablyai/orca --author gentslava --state all --limit 100
```

Use the HTTPS upstream URL if the checkout has no `upstream` remote. Verify the three SHAs directly with `git ls-remote`. Preserve the old master and main SHAs, and check the release linked in the issue. Inspect the upstream diff for changes to the paths touched by selected features, including tests, dependencies, package scripts and `AGENTS.md`. Carry forward applicable upstream instructions in the fork's guidance. Before merging a maintenance PR, preserve the prior fork tips under new archive refs and verify their remote SHA values. Promotion separately archives the refs it replaces.

## Review the selection

Run the audit below on the live source and compare its `plan.json` with the last successful release plan. The planner records the discovered author inventory in `authorInventory`, resolved decisions in `lifecycle`, source heads in `selections` and `forkFeatures`, and successful upstream ancestry checks in `result.suppliedByUpstream`.

| Field                    | Decision                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seed`                   | Track required historically selected PRs even after closure.                                                                                                      |
| `include`                | Add community work explicitly with a reason. Compare its diff, tests, CI and overlap with the existing composition.                                               |
| `exclude`                | Record why a tracked PR is retired, obsolete or superseded by an explicitly named fork feature.                                                                   |
| `replacements`           | Record a verified successor for a PR whose merge has not supplied the function. Audit the successor's actual behavior and dependents.                             |
| `dependencies`           | Declare required application order. Reconcile stacked work with the lifecycle of each prerequisite.                                                               |
| `retainClosed`           | Keep a required closed PR with a product reason. Use `retainedHeadSources` for a refreshed branch belonging to the original PR.                                   |
| `foreignHeadSources`     | Use a reviewed, owner-maintained branch that descends from the exact foreign PR head. Explicit retention is required after closure.                               |
| `reviewedUpstreamMerges` | Record the original head, exact merge SHA, merged time and evidence for previously verified merges with missing metadata. A Git ancestry check remains mandatory. |
| `forkFeatures`           | Name required fork-only branches without an upstream PR and record their purpose.                                                                                 |
| `compatibilityPatches`   | List required integration corrections in application order. Keep each correction tied to a real difference between selected components.                           |

The workflow discovers open main-targeted PRs by the configured author, including drafts, and tracks those PRs after closure. Review new discoveries as well as closed, merged and retargeted PRs. A new upstream merge requires verification of the relevant code after later refactors. Inspect relevant community PRs with `gh pr list -R stablyai/orca --state open --limit 100` and `gh pr view NUMBER -R stablyai/orca`. Give priority to regressions affecting required behavior and package compatibility. Record product choices without an established priority for owner review while working through unrelated changes.

A metadata 404 triggers source review. Check `git ls-remote https://github.com/stablyai/orca.git refs/pull/NUMBER/head`, the archived release plan, the claimed merge's ancestry with `git merge-base --is-ancestor`, and the actual diff with `git show` and `git patch-id --stable`. Look up renamed modules and check that the intended behavior survives. Record evidence before adding a reviewed merge or a retained source. An unavailable source remains a blocker.

## Compose and diagnose

Use a fresh output directory for each run. These commands run from the configuration checkout and require no application dependencies.

```sh
node --test config/fork-build/*.test.mjs
actionlint .github/workflows/personal-build.yml .github/workflows/fork-preview-macos-arm64.yml
node config/fork-build/plan.mjs --audit --keep-source --output /tmp/orca-audit
node config/fork-build/plan.mjs --audit --upstream FULL_UPSTREAM_SHA --output /tmp/orca-historical
node config/fork-build/plan.mjs --force --keep-source --output /tmp/orca-candidate
```

The audit composes without packaging or publishing. Review `report.md`, `plan.json` and the retained `source` checkout. Use the plan's upstream and PR heads with `prepareFeatureMerge` from [composition.mjs](composition.mjs) in a disposable checkout to reproduce individual conflict stages. Use `git ls-files -u` and `git show :1:path`, `:2:path`, `:3:path` to compare the common ancestor and both edits. Fix atomic feature incompatibilities on their owner branches or on reviewed fork integration branches. Preserve the intended behavior, upstream contracts and author history. When both inputs only conflict in the combined source, keep the repair in [merge-resolutions](merge-resolutions/README.md) with the three exact input blobs, a reviewed patch and the result digest. Preserve tests that protect invariants. Remove old resolutions or overlays only after verifying that the new tree provides their behavior or that the underlying path was deliberately retired.

Review updater behavior, compatibility contracts, localization overlays and their baseline inputs. Check `git diff --check`. For an existing successful plan with dependencies installed in its source checkout, repeat the exact-source checks from the trusted configuration checkout.

```sh
node config/fork-build/qualification.mjs /tmp/orca-candidate/plan.json /tmp/orca-candidate/source
node config/fork-build/regressions.mjs /tmp/orca-candidate/plan.json /tmp/orca-candidate/source
```

Open a fork PR with the configuration and required adaptations. Check the complete PR workflow and the personal qualification run. Follow [the repository Git workflow](../../docs/agents-md-refs/git-workflow.md) for failed checks. The scheduled/manual build has its own exact-source formatting, localization, lint, unit, mobile, typecheck and selected integration regression gates. Keep test launches in the background per AGENTS.md.

## CI maintenance

Keep the platform build commands on upstream's current tooling. Check that macOS, Windows, Android and both Linux architectures consume the same source bundle. Review Actions updates using Dependabot, the official action release notes and the runner images. Official Actions use reviewed stable major tags when allowed by repository policy. Preserve immutable pins where policy requires them or where the trust and compatibility review depends on an exact action revision. Keep source identity independent from tool versions. `plan.json` freezes the configuration SHA, upstream SHA, selected heads, final tree and commit. Package metadata, checksums and verification receipts bind downloads to that identity.

## Release and recovery

```sh
gh workflow run personal-build.yml -R gentslava/orca --ref master -f audit_only=true
gh workflow run personal-build.yml -R gentslava/orca --ref master
gh workflow run personal-build.yml -R gentslava/orca --ref master -f force_build=true
gh run watch RUN_ID -R gentslava/orca --compact --exit-status
gh run view RUN_ID -R gentslava/orca --log-failed
gh run download RUN_ID -R gentslava/orca -n personal-source-plan
```

The schedule and default manual build freeze fresh upstream main. A manual `upstream_commit` requires a full SHA on upstream main's history. Use `audit_only=true` for historical diagnostics or to run the read-only audit from a maintenance branch. Package, release and promotion operations require the trusted master workflow. The release path requires both fork branch leases and a fast-forward mirror. When upstream advances while packaging, promotion verifies the frozen source remains an ancestor, reports the newly observed SHA and leaves it for the next cycle. Divergence or concurrently changed fork refs block promotion.

Verify all 11 outputs before staging a draft: macOS ARM64 DMG and ZIP, Windows x64 installer and portable ZIP, Android APK, and AppImage/DEB/RPM for each Linux architecture. The preview signing policy is macOS ad hoc, Windows unsigned and Android Expo debug signing. The Android lane blocks if production signing is required. Archive checks validate architecture, package contents, source identity, version and digests. Report hardware, display and authenticated provider acceptance separately.

The trusted release job uploads and verifies the complete draft asset set. Promotion uses `FORK_SYNC_DEPLOY_KEY` in its isolated job. It verifies the source bundle, archives prior refs and advances fork main and master together by atomic push. The final job checks live promoted refs and publishes that draft. The status job records success only after both operations have succeeded. Keep the last good release and archive refs available.

On failed planning, download the source plan and inspect its lifecycle and conflict evidence. When present, `diagnostic.bundle` contains the partial candidate at `plan.result.commit`. Fetch `plan.upstream` into a disposable Git checkout first, then run `git bundle verify /path/to/diagnostic.bundle` and `git fetch /path/to/diagnostic.bundle refs/heads/personal-candidate:refs/heads/diagnosis`. On build or verification failure, inspect the failed platform job and rerun it with `gh run rerun RUN_ID --failed -R gentslava/orca` once any transient failure is understood. A source/configuration fix requires new checks. If release staging or publishing fails, inspect the existing draft and its verified asset identities. Rerun the failed jobs of the same run to resume with the same release tag; an already completed promotion is recognized only at the exact candidate and mirror refs. If refs differ, preserve the previous release and recompose from current master. Keep partial drafts and promotion receipts for diagnosis. Do not manually advance production refs around a failure.

Completion requires green required checks, 11 independently verified packages, a visible release at the tracked tag, a verified promotion receipt matching both live refs, and a current issue 12 ledger. If upstream moved beyond the mirror during the run, record both SHAs and start the next cycle. Report any required stage that remains blocked.
