import { execFileSync, spawnSync } from 'node:child_process'
import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalBuildVersion } from './build-mac-local.mjs'
import { verifyStagedArchives } from './fork-upstream-archives.mjs'
import { isDirectInvocation } from './script-entry-detection.mjs'

const FORK = 'gentslava/orca'
const FORK_URL = `https://github.com/${FORK}.git`
const UPSTREAM_URL = 'https://github.com/stablyai/orca.git'
const CANDIDATE_REF = 'refs/heads/fork-upstream-candidate'
const MIRROR_REF = 'refs/heads/gentslava/fork-upstream-main'

function git(cwd, args, options = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', ...options }).trim()
}

function ancestor(cwd, older, newer) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', older, newer], { cwd })
  if (result.status === 0) {
    return true
  }
  if (result.status === 1) {
    return false
  }
  throw new Error(`Could not compare ${older} with ${newer}`)
}

function assertSha(sha) {
  if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error('Expected a full Git SHA')
  }
}

function assertPlan(plan) {
  if (plan.repository !== FORK || !['schedule', 'workflow_dispatch'].includes(plan.event)) {
    throw new Error('Only the fork master schedule/manual plan is supported')
  }
  assertSha(plan.forkSha)
  assertSha(plan.upstreamSha)
  if (typeof plan.build !== 'boolean') {
    throw new Error('Invalid build decision')
  }
  if (
    !['dmg', 'both'].includes(plan.formats) ||
    (plan.event === 'schedule' && plan.formats !== 'dmg')
  ) {
    throw new Error('Invalid archive formats for the pinned plan')
  }
}

export function requireForkMaster(env) {
  if (
    env.GITHUB_REPOSITORY !== FORK ||
    env.GITHUB_REF !== 'refs/heads/master' ||
    !['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)
  ) {
    throw new Error('This workflow only operates on gentslava/orca master')
  }
}

export function planSync(
  cwd,
  { forkUrl = FORK_URL, upstreamUrl = UPSTREAM_URL, event, formats = 'dmg' }
) {
  if (!['schedule', 'workflow_dispatch'].includes(event)) {
    throw new Error('Unsupported trigger')
  }
  if (!['dmg', 'both'].includes(formats)) {
    throw new Error('Unsupported preview format')
  }
  git(cwd, ['fetch', '--no-tags', forkUrl, 'refs/heads/master'])
  const forkSha = git(cwd, ['rev-parse', 'FETCH_HEAD^{commit}'])
  git(cwd, ['fetch', '--no-tags', upstreamUrl, 'refs/heads/main'])
  const upstreamSha = git(cwd, ['rev-parse', 'FETCH_HEAD^{commit}'])
  return {
    repository: FORK,
    event,
    forkSha,
    upstreamSha,
    formats: event === 'schedule' ? 'dmg' : formats,
    build: event === 'workflow_dispatch' || !ancestor(cwd, upstreamSha, forkSha)
  }
}

export function mergeCandidate(cwd, plan, upstreamUrl = UPSTREAM_URL) {
  assertPlan(plan)
  if (git(cwd, ['rev-parse', 'HEAD']) !== plan.forkSha) {
    throw new Error('Checkout differs from pinned master')
  }
  if (git(cwd, ['status', '--porcelain'])) {
    throw new Error('Candidate checkout must be clean')
  }
  git(cwd, ['fetch', '--no-tags', upstreamUrl, plan.upstreamSha])
  git(cwd, [
    '-c',
    'user.name=github-actions[bot]',
    '-c',
    'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'merge',
    '--no-ff',
    '--no-edit',
    '-m',
    `fork: integrate upstream main ${plan.upstreamSha}`,
    plan.upstreamSha
  ])
  const candidateSha = git(cwd, ['rev-parse', 'HEAD'])
  if (
    !ancestor(cwd, plan.forkSha, candidateSha) ||
    !ancestor(cwd, plan.upstreamSha, candidateSha)
  ) {
    throw new Error('Candidate lost fork or upstream history')
  }
  git(cwd, ['update-ref', CANDIDATE_REF, candidateSha])
  return { ...plan, candidateSha, version: previewIdentity(cwd).version }
}

export function previewIdentity(cwd) {
  const commit = git(cwd, ['rev-parse', 'HEAD'])
  const { version: base } = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
  const version = createLocalBuildVersion(base, Date.now(), commit).replace(
    /([.-])local\.(?=\d+\.)/,
    '$1local.forkpreview.'
  )
  return { commit, version }
}

export function sealCandidate(cwd, candidate, directory, archiveDirectory) {
  assertPlan(candidate)
  assertSha(candidate.candidateSha)
  if (
    git(cwd, ['rev-parse', 'HEAD']) !== candidate.candidateSha ||
    git(cwd, ['status', '--porcelain', '--untracked-files=no'])
  ) {
    throw new Error('Build changed the tested source tree')
  }
  const archiveValidation = verifyStagedArchives(archiveDirectory, {
    ...candidate,
    commit: candidate.candidateSha
  })
  if (candidate.candidateSha !== candidate.forkSha) {
    git(cwd, [
      'bundle',
      'create',
      join(directory, 'candidate.bundle'),
      CANDIDATE_REF,
      `^${candidate.forkSha}`
    ])
  }
  writeFileSync(
    join(directory, 'candidate.json'),
    `${JSON.stringify({ ...candidate, archiveValidation }, null, 2)}\n`
  )
}

export function promoteCandidate(
  cwd,
  plan,
  candidate,
  directory,
  { forkUrl = FORK_URL, env = process.env } = {}
) {
  assertPlan(plan)
  assertSha(candidate.candidateSha)
  if (
    candidate.forkSha !== plan.forkSha ||
    candidate.upstreamSha !== plan.upstreamSha ||
    candidate.formats !== plan.formats ||
    !plan.build
  ) {
    throw new Error('Candidate does not match the plan')
  }
  git(cwd, ['fetch', '--no-tags', forkUrl, 'refs/heads/master'], { env })
  if (git(cwd, ['rev-parse', 'FETCH_HEAD']) !== plan.forkSha) {
    throw new Error('Master moved during the build; refusing promotion')
  }
  if (candidate.candidateSha === plan.forkSha) {
    return 'unchanged'
  }
  git(cwd, ['bundle', 'verify', join(directory, 'candidate.bundle')])
  git(cwd, ['fetch', join(directory, 'candidate.bundle'), CANDIDATE_REF])
  if (
    git(cwd, ['rev-parse', 'FETCH_HEAD']) !== candidate.candidateSha ||
    !ancestor(cwd, plan.forkSha, candidate.candidateSha) ||
    !ancestor(cwd, plan.upstreamSha, candidate.candidateSha)
  ) {
    throw new Error('Bundle is not the pinned fast-forward candidate')
  }
  const hooks = mkdtempSync(join(tmpdir(), 'orca-fork-promotion-'))
  try {
    // Check the push advertisement too; a fetch followed by an ordinary push has a race window.
    writeFileSync(
      join(hooks, 'pre-push'),
      `#!/bin/sh\nset -eu\nwhile read -r local_ref local_sha remote_ref remote_sha; do\n  test "$local_sha" = "${candidate.candidateSha}"\n  test "$remote_ref" = refs/heads/master\n  test "$remote_sha" = "${plan.forkSha}"\ndone\n`
    )
    chmodSync(join(hooks, 'pre-push'), 0o755)
    git(
      cwd,
      [
        '-c',
        `core.hooksPath=${hooks}`,
        'push',
        forkUrl,
        `${candidate.candidateSha}:refs/heads/master`
      ],
      { env }
    )
  } finally {
    rmSync(hooks, { recursive: true, force: true })
  }
  return 'promoted'
}

function authenticatedGitEnv() {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is required for fork writes')
  }
  const basic = Buffer.from(`x-access-token:${process.env.GITHUB_TOKEN}`).toString('base64')
  return {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`
  }
}

async function recoverIntegration(cwd, plan) {
  assertPlan(plan)
  const env = authenticatedGitEnv()
  git(cwd, ['fetch', '--no-tags', UPSTREAM_URL, plan.upstreamSha])
  git(cwd, ['fetch', '--no-tags', FORK_URL, 'refs/heads/master'], { env })
  if (ancestor(cwd, plan.upstreamSha, git(cwd, ['rev-parse', 'FETCH_HEAD']))) {
    console.log(
      'Upstream is already integrated; no integration PR diff is available. Inspect the failed build diagnostics.'
    )
    return
  }
  // A single upstream mirror stays fast-forward across retries, including conflicted merges.
  git(cwd, ['push', FORK_URL, `${plan.upstreamSha}:${MIRROR_REF}`], { env })
  const api = async (path, method = 'GET', data) => {
    const response = await fetch(`https://api.github.com/repos/${FORK}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      ...(data ? { body: JSON.stringify(data) } : {})
    })
    if (!response.ok) {
      throw new Error(
        `Fork integration PR API failed (${response.status}): ${await response.text()}`
      )
    }
    return response.json()
  }
  const pulls = await api(
    'pulls?state=open&base=master&head=gentslava:gentslava%2Ffork-upstream-main'
  )
  const body = `Automated fork integration needs review. Master was not promoted.\n\nPinned fork master: ${plan.forkSha}\nPinned upstream main: ${plan.upstreamSha}\n\nDiagnostics: https://github.com/${FORK}/actions/runs/${process.env.GITHUB_RUN_ID}\n\nThis head mirrors upstream main so conflicts are visible against master. Resolve the integration and rerun the manual workflow; do not bypass failed checks.`
  const pr = pulls[0]
    ? await api(`pulls/${pulls[0].number}`, 'PATCH', { body })
    : await api('pulls', 'POST', {
        title: 'fork: integrate upstream main (verification required)',
        head: MIRROR_REF.replace('refs/heads/', ''),
        base: 'master',
        body
      })
  console.log(`Fork integration PR: ${pr.html_url}`)
}

async function main() {
  requireForkMaster(process.env)
  const cwd = process.cwd()
  const directory = join(process.env.RUNNER_TEMP, 'fork-sync')
  mkdirSync(directory, { recursive: true })
  const command = process.argv[2]
  if (command === 'plan') {
    const plan = planSync(cwd, {
      event: process.env.GITHUB_EVENT_NAME,
      formats: process.env.PREVIEW_FORMATS
    })
    writeFileSync(join(directory, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `build=${plan.build}\nplan=${JSON.stringify(plan)}\nfork-sha=${plan.forkSha}\nformats=${plan.formats}\n`
    )
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Pinned fork master: ${plan.forkSha}\n\nPinned upstream main: ${plan.upstreamSha}\n\nBuild required: ${plan.build}\n`
    )
    return
  }
  const plan = JSON.parse(process.env.FORK_SYNC_PLAN)
  assertPlan(plan)
  if (command === 'merge') {
    const candidate = mergeCandidate(cwd, plan)
    writeFileSync(join(directory, 'candidate.json'), `${JSON.stringify(candidate, null, 2)}\n`)
    appendFileSync(
      process.env.GITHUB_ENV,
      `ORCA_LOCAL_BUILD_VERSION=${candidate.version}\nORCA_BUILD_COMMIT=${candidate.candidateSha}\nFORK_MASTER_SHA=${plan.forkSha}\nUPSTREAM_MAIN_SHA=${plan.upstreamSha}\n`
    )
  } else if (command === 'seal') {
    sealCandidate(
      cwd,
      JSON.parse(readFileSync(join(directory, 'candidate.json'), 'utf8')),
      directory,
      '.build/fork-preview'
    )
  } else if (command === 'promote') {
    const candidate = JSON.parse(readFileSync(join(directory, 'candidate.json'), 'utf8'))
    const result = promoteCandidate(cwd, plan, candidate, directory, { env: authenticatedGitEnv() })
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Promotion: ${result}\n\nBuilt source: ${candidate.candidateSha}\n`
    )
  } else if (command === 'recover') {
    await recoverIntegration(cwd, plan)
  } else {
    throw new Error(`Unknown fork-sync command: ${command}`)
  }
}

if (isDirectInvocation(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error)
    if (process.env.RUNNER_TEMP) {
      const directory = join(process.env.RUNNER_TEMP, 'fork-sync')
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, `${process.argv[2]}-failure.txt`), `${error.stack ?? error}\n`)
    }
    process.exitCode = 1
  })
}
