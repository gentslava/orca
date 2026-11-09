import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { api, readLedger, renderReport } from './github.mjs'
import { resolveSelection } from './selection.mjs'
import { assertFrozenHead, compose, freezeRetainedHead, git } from './composition.mjs'
import { controlFingerprint } from './promotion.mjs'
import { currentCompatibilityPatch } from './retired-test-fixtures.mjs'
import { applyForkLocalizations } from './fork-localizations.mjs'
import { createLocalBuildVersion } from '../scripts/desktop-distribution/macos/build-mac-local.mjs'

const here = import.meta.dirname
const config = JSON.parse(readFileSync(join(here, 'selection.json'), 'utf8'))
const directory = resolve(process.env.FORK_BUILD_OUTPUT || 'personal-build')
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
  auditOnly: process.env.AUDIT_ONLY === 'true',
  runUrl: `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  blockers: [],
  lifecycle: [],
  selections: [],
  outputs: config.outputs,
  tracked: config.seed
}
try {
  const ledger = config.statusIssue
    ? readLedger(api(`repos/${process.env.GITHUB_REPOSITORY}/issues/${config.statusIssue}`).body)
    : { tracked: [] }
  plan.previous = ledger
  plan.upstream = api(`repos/${config.upstream}/git/ref/heads/${config.base}`).object.sha
  const own = []
  for (const author of config.authors) {
    const query = encodeURIComponent(
      `repo:${config.upstream} is:pr is:open author:${author} base:${config.base}`
    )
    const search = api(`search/issues?q=${query}&per_page=100`)
    if (search.incomplete_results || search.total_count > 100) {
      throw new Error('Incomplete own-PR discovery; narrow or paginate before building')
    }
    own.push(
      ...search.items.map((pr) => ({ ...pr, user: { login: author }, base: { ref: config.base } }))
    )
  }
  const resolved = await resolveSelection(config, {
    openOwn: own,
    previous: ledger.tracked,
    readPr: async (number) => api(`repos/${config.upstream}/pulls/${number}`),
    readRetainedHead: async ({ repository, ref }) =>
      api(`repos/${repository}/git/ref/${ref.slice('refs/'.length)}`).object.sha
  })
  Object.assign(plan, resolved)
  const source = join(directory, 'source')
  mkdirSync(source)
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
      : `refs/pull/${pr.number}/head:refs/personal/${pr.retainedHeadSource ? 'closed-pr' : 'pr'}-${pr.number}`
  )
  git(source, ['fetch', '--no-tags', 'origin', plan.upstream, ...new Set(selectedRefs)])
  for (const pr of plan.selections) {
    if (pr.retainedHeadSource) {
      freezeRetainedHead(source, pr)
    } else if (!pr.merged_at) {
      assertFrozenHead(source, pr.number, pr.head.sha)
    }
  }
  plan.result = compose(source, plan.upstream, plan.selections, { timestamp: plan.timestamp })
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
        'composed-source-modules.patch'
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
  plan.result.commit = git(source, ['rev-parse', 'HEAD'])
  plan.result.tree = git(source, ['rev-parse', 'HEAD^{tree}'])
  plan.compatibilityContract = JSON.parse(
    git(source, [
      'show',
      `${plan.result.commit}:src/shared/local-build-compatibility-contract.json`
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
  const baseVersion = JSON.parse(git(source, ['show', 'HEAD:package.json'])).version
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
        heads: plan.selections.map((pr) => [
          pr.number,
          pr.state,
          pr.head.sha,
          pr.merge_commit_sha,
          pr.retainedHeadSource ?? null
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
    process.env.FORCE_BUILD !== 'true'
  if (plan.result.publishable && !plan.auditOnly && !plan.reuse) {
    git(source, [
      'bundle',
      'create',
      join(directory, 'source.bundle'),
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
      `build=${build}\nconfiguration=${configuration}\nupstream=${plan.upstream || ''}\n`
    )
  }
  if (!plan.result?.publishable) {
    process.exitCode = 1
  }
  if (existsSync(join(directory, 'source'))) {
    // The source checkout is not an artifact; only the frozen bundle and receipts are uploaded.
    const { rmSync } = await import('node:fs')
    rmSync(join(directory, 'source'), { recursive: true, force: true, maxRetries: 3 })
  }
}
