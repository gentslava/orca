import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { api, readLedger, readPullRequest, renderReport, searchPullRequests } from './github.mjs'
import { resolveSelection } from './selection.mjs'
import {
  assertFrozenHead,
  compose,
  freezeForeignHead,
  freezeForkFeatureHead,
  freezeRetainedHead,
  git,
  isAncestor
} from './composition.mjs'
import { controlFingerprint } from './promotion.mjs'
import { currentCompatibilityPatch } from './retired-test-fixtures.mjs'
import { applyForkLocalizations } from './fork-localizations.mjs'
import { upstreamReleaseIdentity } from './upstream-release-identity.mjs'
import {
  selectUpstreamBuildCommit,
  requireUpstreamBuildAncestor
} from './upstream-build-baseline.mjs'
import { createLocalBuildVersion } from '../scripts/desktop-distribution/macos/build-mac-local.mjs'
import { packageTargets } from './package-targets.mjs'

const here = import.meta.dirname
const forkRepository = process.env.GITHUB_REPOSITORY || 'gentslava/orca'
const config = JSON.parse(readFileSync(join(here, 'selection.json'), 'utf8'))
const { values: options } = parseArgs({
  options: {
    audit: { type: 'boolean' },
    force: { type: 'boolean' },
    'keep-source': { type: 'boolean' },
    upstream: { type: 'string' },
    output: { type: 'string' }
  }
})
const requestedUpstream = options.upstream ?? process.env.FORK_BUILD_UPSTREAM_COMMIT
const directory = resolve(options.output || process.env.FORK_BUILD_OUTPUT || 'personal-build')
const source = join(directory, 'source')
let createdSource = false
mkdirSync(directory, { recursive: true })
const configuration = git(process.cwd(), ['rev-parse', 'HEAD'])
if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== configuration) {
  throw new Error('Workflow/configuration identity mismatch')
}
const plan = {
  schemaVersion: 1,
  configuration,
  repository: config.upstream,
  timestamp: new Date().toISOString(),
  auditOnly: options.audit || process.env.AUDIT_ONLY === 'true',
  releaseTag: process.env.GITHUB_RUN_ID
    ? `personal-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`
    : undefined,
  runUrl: process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${forkRepository}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : undefined,
  blockers: [],
  lifecycle: [],
  selections: [],
  outputs: config.outputs,
  tracked: config.seed
}
try {
  plan.targets = packageTargets(plan.outputs)
  const ledger = config.statusIssue
    ? readLedger(api(`repos/${forkRepository}/issues/${config.statusIssue}`).body)
    : { tracked: [] }
  plan.previous = ledger
  plan.forkMain = api(`repos/${forkRepository}/git/ref/heads/main`).object.sha
  const observedUpstream = api(`repos/${config.upstream}/git/ref/heads/${config.base}`).object.sha
  plan.upstream = selectUpstreamBuildCommit(observedUpstream, requestedUpstream)
  plan.upstreamBaseline = {
    observed: observedUpstream,
    requested: Boolean(requestedUpstream?.trim()),
    pinned: plan.upstream !== observedUpstream
  }
  plan.upstreamRelease = upstreamReleaseIdentity(api(`repos/${config.upstream}/releases/latest`))
  const own = []
  plan.authorInventory = []
  for (const author of config.authors) {
    const query = `repo:${config.upstream} is:pr author:${author}`
    const records = searchPullRequests(query)
    const ownMain = searchPullRequests(`${query} is:open base:${config.base}`)
    own.push(
      ...ownMain.map((pr) => ({ ...pr, user: { login: author }, base: { ref: config.base } }))
    )
    const openMain = new Set(ownMain.map(({ number }) => number))
    plan.authorInventory.push(
      ...records.map((pr) => ({
        number: pr.number,
        title: pr.title,
        author,
        state: pr.pull_request?.merged_at ? 'merged' : pr.state,
        draft: pr.draft === true,
        openOnMain: openMain.has(pr.number)
      }))
    )
  }
  const resolved = await resolveSelection(config, {
    openOwn: own,
    previous: ledger.tracked,
    readPr: async (number) => readPullRequest(`repos/${config.upstream}/pulls/${number}`),
    readRetainedHead: async ({ repository, ref }) =>
      api(`repos/${repository}/git/ref/${ref.slice('refs/'.length)}`).object.sha,
    forkRepository,
    readForkBranch: async ({ repository, ref }) => ({
      ...api(`repos/${repository}/git/ref/${ref.slice('refs/'.length)}`),
      repository: api(`repos/${repository}`).full_name
    })
  })
  Object.assign(plan, resolved)
  mkdirSync(source)
  createdSource = true
  git(source, ['init'])
  git(source, ['config', 'gc.auto', '0'])
  if (process.env.FORK_BUILD_REFERENCE) {
    const reference = resolve(process.env.FORK_BUILD_REFERENCE)
    const objects = resolve(reference, git(reference, ['rev-parse', '--git-path', 'objects']))
    writeFileSync(join(source, '.git/objects/info/alternates'), `${objects}\n`)
  }
  git(source, ['remote', 'add', 'origin', `https://github.com/${config.upstream}.git`])
  const selectedRefs = plan.selections.map((pr) =>
    pr.merged_at
      ? pr.merge_commit_sha
      : `refs/pull/${pr.number}/head:refs/personal/${pr.retainedHeadSource ? 'closed-pr' : pr.foreignHeadSource ? 'foreign-pr' : 'pr'}-${pr.number}`
  )
  git(source, [
    'fetch',
    '--no-tags',
    'origin',
    ...new Set([plan.upstream, observedUpstream, ...selectedRefs])
  ])
  requireUpstreamBuildAncestor(source, plan.upstream, observedUpstream)
  const mergedAfterBaseline = plan.selections.filter(
    (pr) => pr.merged_at && !isAncestor(source, pr.merge_commit_sha, plan.upstream)
  )
  if (mergedAfterBaseline.length) {
    git(source, [
      'fetch',
      '--no-tags',
      'origin',
      ...mergedAfterBaseline.map(
        (pr) => `refs/pull/${pr.number}/head:refs/personal/pr-${pr.number}`
      )
    ])
  }
  const frozen = []
  for (const pr of plan.selections) {
    try {
      if (pr.retainedHeadSource) {
        freezeRetainedHead(source, pr)
      } else if (pr.foreignHeadSource) {
        freezeForeignHead(source, pr)
      } else if (!pr.merged_at || mergedAfterBaseline.includes(pr)) {
        assertFrozenHead(source, pr.number, pr.head.sha)
      }
      frozen.push(pr)
    } catch (error) {
      plan.blockers.push({ number: pr.number, reason: error.message })
    }
  }
  for (const feature of plan.forkFeatures) {
    try {
      freezeForkFeatureHead(source, feature)
      frozen.push(feature)
    } catch (error) {
      plan.blockers.push({ feature: feature.feature, reason: error.message })
    }
  }
  plan.result = compose(source, plan.upstream, frozen, {
    timestamp: plan.timestamp,
    observedUpstream
  })
  for (const patch of config.compatibilityPatches) {
    if (
      ![
        'preview-updater-guard.patch',
        'test-runner-registration.patch',
        'integration-module-boundaries.patch',
        'conversation-project-order.patch',
        'model-fallback-next-turn-test.patch',
        'reviewed-merge-target-paths.patch',
        'upstream-module-relocations.patch',
        'startup-chat-catalog.patch',
        'composed-format.patch',
        'composed-ci-contracts.patch',
        'project-start-actions.patch',
        'codex-selected-account-read.patch',
        'runtime-environment-rename.patch',
        'account-usage-row-layout.patch',
        'composed-source-modules.patch',
        'composed-reactive-copy.patch',
        'fork-ci-macos-arm64-image.patch',
        'composed-contract-migrations.patch',
        'composed-qualification-format.patch',
        'selected-regressions.patch',
        'composed-source-quality.patch',
        'release-typecheck-contracts.patch'
      ].includes(patch)
    ) {
      throw new Error('Unrecognized compatibility correction')
    }
    const path = join(here, patch)
    plan.compatibility ??= []
    plan.compatibility.push({
      file: patch,
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex')
    })
    try {
      const current = currentCompatibilityPatch(
        source,
        plan.upstream,
        readFileSync(path, 'utf8'),
        git
      )
      if (!current.text && !current.retirements.length) {
        throw new Error('Empty required compatibility correction')
      }
      let applicable = path
      if (current.retirements.length) {
        Object.assign(plan.compatibility.at(-1), {
          retiredTestFixtures: current.retirements,
          appliedSha256: createHash('sha256').update(current.text).digest('hex')
        })
        const filtered = join(source, '.git/fork-compatibility-patches')
        mkdirSync(filtered, { recursive: true })
        applicable = join(filtered, patch)
        writeFileSync(applicable, current.text)
      }
      if (current.text) {
        git(source, ['apply', '--check', applicable])
        git(source, ['apply', '--index', applicable])
        git(source, ['commit', '-m', `Personal packaging policy: ${patch}`], {
          GIT_AUTHOR_DATE: plan.timestamp,
          GIT_COMMITTER_DATE: plan.timestamp
        })
      }
    } catch (error) {
      plan.blockers.push({
        reason: `Required compatibility correction failed: ${patch}: ${error.message}`
      })
    }
  }
  try {
    plan.localizations = applyForkLocalizations(source, here, git, plan.timestamp)
  } catch (error) {
    plan.blockers.push({ reason: `Required fork localization failed: ${error.message}` })
  }
  if (
    plan.result.publishable &&
    !plan.blockers.length &&
    git(source, ['rev-parse', 'HEAD']) !== plan.result.commit
  ) {
    const overlays = git(
      source,
      [
        'commit-tree',
        git(source, ['write-tree']),
        '-p',
        plan.result.commit,
        '-m',
        'fork: apply required compatibility and localization'
      ],
      {
        GIT_AUTHOR_DATE: plan.timestamp,
        GIT_COMMITTER_DATE: plan.timestamp
      }
    )
    git(source, ['reset', '--hard', overlays])
  }
  plan.result.commit = git(source, ['rev-parse', 'HEAD'])
  plan.result.tree = git(source, ['rev-parse', 'HEAD^{tree}'])
  plan.compatibilityContract = JSON.parse(
    git(source, [
      'show',
      `${plan.result.commit}:src/shared/remote-runtime/orcad-distribution/local-build-compatibility-contract.json`
    ])
  )
  const mobile = JSON.parse(git(source, ['show', 'HEAD:mobile/app.json'])).expo
  if (
    !/^\d+\.\d+\.\d+$/.test(mobile.version || '') ||
    !Number.isSafeInteger(mobile.android?.versionCode) ||
    mobile.android.versionCode < 1 ||
    typeof mobile.android.package !== 'string'
  ) {
    throw new Error('Invalid committed Android release identity')
  }
  plan.mobile = {
    mobileVersion: mobile.version,
    versionCode: mobile.android.versionCode,
    applicationId: mobile.android.package
  }
  plan.result.publishable &&= !plan.blockers.length
  const baseVersion = plan.upstreamRelease.baseVersion
  plan.version = createLocalBuildVersion(
    baseVersion,
    Date.parse(plan.timestamp),
    plan.result.commit
  ).replace(/([.-])local\.(?=\d+\.)/, '$1local.forkpreview.')
  plan.fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        configuration: controlFingerprint(process.cwd(), configuration),
        upstream: plan.upstream,
        upstreamRelease: plan.upstreamRelease,
        heads: plan.selections.map((pr) => [
          pr.number,
          pr.state,
          pr.head.sha,
          pr.merge_commit_sha,
          pr.retainedHeadSource ?? pr.foreignHeadSource ?? null
        ]),
        forkFeatures: plan.forkFeatures.map((feature) => [
          feature.feature,
          feature.repository,
          feature.ref,
          feature.head.sha
        ]),
        outputs: config.outputs,
        compatibility: plan.compatibility,
        localizations: plan.localizations
      })
    )
    .digest('hex')
  plan.reuse =
    ledger.lastGood?.promoted === true &&
    ledger.lastGood.fingerprint === plan.fingerprint &&
    !options.force &&
    process.env.FORCE_BUILD !== 'true'
  const bundleName = plan.result.publishable
    ? !plan.auditOnly && !plan.reuse && 'source.bundle'
    : plan.result.commit !== plan.upstream && 'diagnostic.bundle'
  if (bundleName) {
    git(source, [
      'bundle',
      'create',
      join(directory, bundleName),
      'refs/heads/personal-candidate',
      `^${plan.upstream}`
    ])
  }
} catch (error) {
  plan.error = error.message
  process.exitCode = 1
} finally {
  writeFileSync(join(directory, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`)
  const report = renderReport(plan)
  writeFileSync(join(directory, 'report.md'), report)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report)
  }
  const build = !!plan.result?.publishable && !plan.error && !plan.auditOnly && !plan.reuse
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `build=${build}\nreceipt=true\ntag=${plan.releaseTag || ''}\nconfiguration=${configuration}\nupstream=${plan.upstream || ''}\nsource=${plan.result?.commit || ''}\nlinux_matrix=${JSON.stringify(plan.targets?.filter((target) => target.platform === 'linux') ?? [])}\n`
    )
  }
  if (!plan.result?.publishable) {
    process.exitCode = 1
  }
  if (createdSource && !options['keep-source'] && process.env.FORK_BUILD_KEEP_SOURCE !== 'true') {
    // The source checkout is not an artifact; only the frozen bundle and receipts are uploaded.
    const { rmSync } = await import('node:fs')
    rmSync(join(directory, 'source'), { recursive: true, force: true, maxRetries: 3 })
  }
}
