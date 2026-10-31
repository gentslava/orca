import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { git, isAncestor } from './composition.mjs'
import { pushPinnedForkRefs, requireForkMaster } from '../scripts/fork-upstream-sync.mjs'
import { withForkSyncSsh } from '../scripts/fork-upstream-ssh.mjs'
import { isDirectInvocation } from '../scripts/script-entry-detection.mjs'

const controlPaths = [
  'AGENTS.md',
  '.github/workflows/personal-build.yml',
  '.github/workflows/fork-preview-macos-arm64.yml',
  'config/fork-build',
  'config/fork-upstream-github-known-hosts',
  'config/scripts/fork-upstream-archives.mjs',
  'config/scripts/fork-upstream-archives.test.mjs',
  'config/scripts/fork-upstream-regressions.mjs',
  'config/scripts/fork-upstream-ssh.mjs',
  'config/scripts/fork-upstream-sync.mjs',
  'config/scripts/fork-upstream-sync.test.mjs',
  'src/main/updater.fork-preview.test.ts'
]

export function controlFingerprint(cwd, commit) {
  return createHash('sha256')
    .update(git(cwd, ['ls-tree', '-r', '-z', commit, '--', ...controlPaths], {}, { raw: true }))
    .digest('hex')
}

function assertPlan(plan) {
  for (const sha of [plan.configuration, plan.upstream, plan.result?.commit, plan.result?.tree]) {
    if (!/^[a-f0-9]{40}$/.test(sha || '')) {
      throw new Error('Invalid promotion source identity')
    }
  }
  if (
    plan.repository !== 'stablyai/orca' ||
    !plan.result.publishable ||
    plan.result.upstream !== plan.upstream ||
    plan.error ||
    plan.auditOnly ||
    plan.reuse
  ) {
    throw new Error('Only a complete packaged personal build may be promoted')
  }
}

export function preparePromotion(cwd, plan) {
  assertPlan(plan)
  if (
    git(cwd, ['rev-parse', 'HEAD']) !== plan.result.commit ||
    git(cwd, ['rev-parse', 'HEAD^{tree}']) !== plan.result.tree ||
    git(cwd, ['status', '--porcelain']) ||
    !isAncestor(cwd, plan.upstream, plan.result.commit)
  ) {
    throw new Error('Promotion checkout differs from the built source')
  }
  const paths = git(cwd, [
    'ls-tree',
    '-r',
    '--name-only',
    plan.configuration,
    '--',
    ...controlPaths
  ])
    .split('\n')
    .filter(Boolean)
  if (!paths.includes('.github/workflows/personal-build.yml') || !paths.includes('AGENTS.md')) {
    throw new Error('Pinned fork workflow or agent guidance is missing')
  }
  const sourcePaths = git(cwd, [
    'ls-tree',
    '-r',
    '--name-only',
    plan.result.commit,
    '--',
    ...controlPaths
  ])
    .split('\n')
    .filter(Boolean)
  git(cwd, [
    'restore',
    '--source',
    plan.configuration,
    '--staged',
    '--worktree',
    '--',
    ...new Set([...paths, ...sourcePaths])
  ])
  const changed = git(cwd, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean)
  if (
    changed.some(
      (path) => !controlPaths.some((entry) => path === entry || path.startsWith(`${entry}/`))
    )
  ) {
    throw new Error('Promotion changed application code outside the control allowlist')
  }
  const tree = git(cwd, ['write-tree'])
  const commit = git(cwd, [
    'commit-tree',
    tree,
    '-p',
    plan.configuration,
    '-p',
    plan.result.commit,
    '-m',
    `fork: promote verified personal build on upstream ${plan.upstream}\n\nBuilt source: ${plan.result.commit}\nWorkflow: ${plan.runUrl}`
  ])
  if (controlFingerprint(cwd, commit) !== controlFingerprint(cwd, plan.configuration)) {
    throw new Error('Promotion did not preserve the pinned fork control files')
  }
  return {
    commit,
    tree,
    source: plan.result.commit,
    upstream: plan.upstream,
    configuration: plan.configuration,
    preserved: paths
  }
}

export function promoteBranches(
  cwd,
  plan,
  candidate,
  { forkUrl = 'git@github.com:gentslava/orca.git', env = process.env } = {}
) {
  assertPlan(plan)
  if (
    candidate.source !== plan.result.commit ||
    candidate.upstream !== plan.upstream ||
    candidate.configuration !== plan.configuration ||
    git(cwd, ['rev-parse', `${candidate.commit}^{tree}`]) !== candidate.tree ||
    !isAncestor(cwd, plan.configuration, candidate.commit) ||
    !isAncestor(cwd, plan.result.commit, candidate.commit)
  ) {
    throw new Error('Promotion does not match the built source and pinned master')
  }
  const output = git(cwd, ['ls-remote', forkUrl, 'refs/heads/master', 'refs/heads/main'], env, {
    inheritEnv: false
  })
  const refs = new Map(output.split('\n').map((line) => line.split('\t').toReversed()))
  if (refs.get('refs/heads/master') !== plan.configuration) {
    throw new Error('Master moved during the build; refusing promotion')
  }
  const main = refs.get('refs/heads/main')
  if (!/^[a-f0-9]{40}$/.test(main || '')) {
    throw new Error('Fork main is missing')
  }
  git(cwd, ['fetch', '--no-tags', forkUrl, main], env, { inheritEnv: false })
  pushPinnedForkRefs(
    cwd,
    [
      { ref: 'refs/heads/master', before: plan.configuration, after: candidate.commit },
      { ref: 'refs/heads/main', before: main, after: plan.upstream }
    ],
    { forkUrl, env }
  )
  return { ...candidate, status: 'promoted', main: plan.upstream, master: candidate.commit }
}

async function main() {
  requireForkMaster(process.env)
  const directory = resolve(process.argv[2])
  const plan = JSON.parse(readFileSync(join(directory, 'plan.json'), 'utf8'))
  assertPlan(plan)
  if (
    plan.configuration !== process.env.GITHUB_SHA ||
    git(process.cwd(), ['rev-parse', 'HEAD']) !== plan.configuration
  ) {
    throw new Error('Promotion configuration differs from the trusted workflow checkout')
  }
  const source = join(directory, 'promotion-source')
  mkdirSync(source)
  git(source, ['init'])
  git(source, ['fetch', '--no-tags', process.cwd(), plan.configuration])
  git(source, ['fetch', '--no-tags', 'https://github.com/stablyai/orca.git', plan.upstream])
  git(source, ['bundle', 'verify', join(directory, 'source.bundle')])
  git(source, ['fetch', join(directory, 'source.bundle'), 'refs/heads/personal-candidate'])
  if (git(source, ['rev-parse', 'FETCH_HEAD']) !== plan.result.commit) {
    throw new Error('Downloaded source differs from the built source')
  }
  git(source, ['checkout', '--detach', plan.result.commit])
  const candidate = preparePromotion(source, plan)
  const receipt = await withForkSyncSsh(process.env, (env) =>
    promoteBranches(source, plan, candidate, { env })
  )
  writeFileSync(join(directory, 'promotion.json'), `${JSON.stringify(receipt, null, 2)}\n`)
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `Master promoted: \`${receipt.master}\`\n\nMain mirrored: \`${receipt.main}\`\n\nBuilt source: \`${receipt.source}\`\n`
  )
}

if (isDirectInvocation(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
