# Fork upstream sync and ARM64 previews

`.github/workflows/fork-preview-macos-arm64.yml` belongs only to `gentslava/orca`.
It runs manually on `master` and every six hours at minute 17 UTC. The workflow
must be present on the fork's default branch, which must be `master` for its ref
guard to admit scheduled runs. GitHub schedules are best effort, can be delayed,
and can be disabled after inactivity in a public fork. See the
[GitHub trigger reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Integration and promotion

1. A dependency-free Ubuntu job fetches and pins fork `master` and
   `stablyai/orca` `main`. Scheduled runs stop here when that upstream commit is
   already an ancestor of master. Manual runs deliberately rebuild even then.
2. A read-only `macos-15` ARM64 job checks out the exact fork SHA and merges only
   the pinned upstream SHA. Existing fork features and build fixups remain Git
   commits; there is no patch replay or optional fixup step. Conflicts fail the
   run with the unresolved index intact for diagnostics.
3. The merged `git rev-parse HEAD` supplies the source commit and the existing
   local-version helper supplies `local.forkpreview.<timestamp>.<short-sha>`.
   This identity is set **before** tests and bundling. Artifact metadata records
   the merged commit, both pinned parents, and the separate workflow commit.
4. Explicit desktop/backend/renderer suites cover Gemini ACP, conversation
   navigation, compact work runs, composer queue editing/moves, worker roles,
   sidebar summaries, Usage account attribution/projection/runtime RPC, renderer
   quotas/history, Russian UI and the fork updater guard. Mobile suites cover
   work runs, session options, child conversation navigation on local/remote
   folder hosts, and conversation isolation for overlays/composer trays.
   Every named test file must exist. Append new feature suites to the explicit
   lists in `config/scripts/fork-upstream-regressions.mjs` during integration;
   missing required suites fail before any test subprocess starts. The normal
   `build:desktop:ci` runs the full CI typecheck and desktop/CLI/web/mobile asset
   builds; native helper build and verification remain mandatory.
5. Existing electron-builder hooks package a **DMG** for scheduled runs (manual
   `formats: both` additionally requires a ZIP), verify the
   ARM64 executable and ad-hoc integrity signature. Staging reads the full commit,
   version, architecture and compatibility contract from the unpacked app's
   `Contents/Resources/orca-local-build.json`, and checks its plist version,
   executable architecture and deep/strict codesign verification. It mounts each
   DMG read-only with `hdiutil -nobrowse -noautoopen` at a temporary mount point,
   or extracts each ZIP with `ditto`, then repeats those checks on its enclosed
   app. The `app.asar`, executable and entire app tree (file hashes, executable
   bits, directory paths and symlink targets) must match the unpacked build.
   The staged `build-info.json` contains each measured identity, tree digest and
   archive checksum; `app-tree-manifest.json` preserves the compared manifest.
   The full source SHA is required: older local packages with only a short SHA
   in their embedded compatibility metadata fail this gate.
   Archive upload must succeed before seal independently reopens the staged
   archives, rechecks their digests and app proofs against the pinned candidate,
   and records those measurements beside the clean source tree in the candidate
   bundle metadata. All mounts detach in `finally`; failed detach preserves the
   mount for diagnostics and fails the gate. None of these checks launches an
   app, Finder, or the existing isolated human launcher.
6. A fresh Ubuntu writer downloads that bundle only after the entire macOS job
   succeeds. It verifies the planned fork SHA, candidate SHA, and ancestry of
   both inputs. It never checks out or executes merged source. It uses an
   ordinary fast-forward push to fork master, with no force option. A temporary
   pre-push hook also requires the push advertisement's old master SHA to match
   the plan; Git's receive transaction rejects changes after that advertisement.
   This closes the fetch-to-push race even when a new master is an ancestor of
   the candidate. A manual unchanged build makes no commit or push.

The workflow has one concurrency group with cancellation disabled. Only schedule
and manual events can enter it; pushes and PRs cannot trigger a sync loop. All
agent/CI app launches have `ORCA_BACKGROUND_LAUNCH=1` and disposable data paths.
The distributed launcher remains an explicit human action, verifies the version
and signature, and starts the app with a fresh isolated profile and HOME. The
runtime `local.forkpreview` updater guard is required and remains covered by its
existing behavioral tests. Normal app channels retain their existing behavior.

## Failures and recovery

Conflicts, failed regressions/typechecks/native verification/builds, missing
archives, failed archive uploads and rejected promotions leave master unchanged. Prior
successful run artifacts remain separate and are never overwritten. Git status,
conflicts, worktree/index patches, source identities and available test/build logs
are uploaded even after failure. Existing DMG/ZIP files are also retained under an
explicit **unpromoted** artifact if a later staging/check step fails. Downloads
from a failed run are diagnostic artifacts, not evidence of successful promotion.
Artifacts expire after seven days; download a last-good build if it must be kept.

A separate writer attempts one open integration PR inside the fork, from
`gentslava/fork-upstream-main` into `master`. That branch mirrors the exact pinned
upstream commit, so even a conflicted merge has a usable PR head. It advances by
ordinary fast-forward pushes and reuses the existing PR for that head/base. A
failed-check PR deliberately shows the upstream delta rather than publishing an
untested candidate as master. Its body links the failed run and pins both inputs.
When current master already contains the upstream SHA there is no integration
diff; the job reports that and leaves the failed build diagnostics for review.

There is no automatic conflict resolution, skipped fixup, reset of master, forced
push, PR merge or credential creation. Resolve conflicts/check failures in the
fork through normal review and run the manual workflow again. If master advances
during a build, a later scheduled/manual run plans from the new master; the
current candidate is never rebased or rebuilt silently before promotion.

## Permissions and operating limits

Planning and all merged-code execution have only `contents: read`, and checkout
never persists credentials. Only the final promotion job gets `contents: write`;
only the recovery job additionally gets `pull-requests: write`. They use the
job's `GITHUB_TOKEN` in memory for authenticated fork writes, never personal
tokens, generated GitHub App tokens or upstream credentials. All write URLs are
hardcoded to the fork. See
[GitHub token permissions](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token).

Repository/organization policy can still deny pushes or automated PR creation.
For the PR fallback, enable **Settings → Actions → General → Workflow permissions
→ Allow GitHub Actions to create and approve pull requests** in `gentslava/orca`.
This is the repository Actions API field `can_approve_pull_request_reviews: true`
on `PUT /repos/gentslava/orca/actions/permissions/workflow`. The default workflow
permission can remain `read`: this workflow grants the two writer jobs only the
permissions declared above and never approves a PR. See the
[repository Actions settings reference](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests).
Protected
master rules, workflow-file permission restrictions, an upstream history rewrite,
or a human modification of the mirror branch can reject ordinary pushes. Such
rejections fail visibly, preserve master, and retain diagnostics; this workflow
does not acquire broader credentials or bypass those rules. No automatic PR CI
or push-triggered CI is relied upon for the promotion gate; all required checks
run explicitly before the writer job. GitHub's
[token-trigger behavior](https://docs.github.com/en/actions/concepts/security/github_token#when-github_token-triggers-workflow-runs)
also limits workflows initiated by token writes.

This is a local preview build with ad-hoc signatures, no Developer ID signing,
notarization, release publication, auto-update channel, GUI validation, Docker
image or bundled full-platform orcad deployment template. Packaging retains the
existing supported local-build policy and native/terminal-host checks. Native
focus and visible-window tests must run on an isolated display or CI. No workflow
or script in this change launches the human launcher.

## Local verification

Use Node 24 first on PATH and `ORCA_BACKGROUND_LAUNCH=1`. Install the root and
separate mobile dependencies with their frozen lockfiles, then run:

```sh
node config/scripts/fork-upstream-regressions.mjs
actionlint -oneline .github/workflows/fork-preview-macos-arm64.yml
```

`fork-upstream-sync.test.mjs` uses real temporary repositories and bare remotes
for unchanged/manual decisions, pinned clean merges, conflicts, source drift,
archive-verifier error propagation, bundle promotion and both build-time and
fetch-to-push master races. Its archive verifier is mocked to keep Git protocol
coverage independent of the host OS. `fork-upstream-archives.test.mjs` exercises
the real verifier on macOS with a compiled, ad-hoc-signed ARM64 fixture app,
real DMGs and ZIPs. It rejects fake-text DMGs, mismatched embedded commit/version/
architecture, wrong plist versions, changed ASAR/resource bytes and corrupt
archives even with forged sidecar checksums. The fixture executable is never run.
Only temporary fixture files and remotes are mutated by these tests. A successful local
test run does not prove hosted macOS packaging, GitHub write policy or PR API
acceptance; the first manually dispatched integrated workflow establishes those.
