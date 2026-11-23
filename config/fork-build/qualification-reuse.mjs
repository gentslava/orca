import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { git } from './composition.mjs'

const repository = 'gentslava/orca'
const workflow = '.github/workflows/personal-build.yml'
// Qualification from before the reuse input was added remains eligible.
const previousWorkflowBlob = 'ddc49f97dd059634c1eca38167d403e689d50ff3'
const [id, output] = process.argv.slice(2)
const env = process.env
if (
  env.GITHUB_REPOSITORY !== repository ||
  env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
  env.GITHUB_REF !== 'refs/heads/master' ||
  !/^[1-9]\d{0,19}$/.test(id ?? '') ||
  id === env.GITHUB_RUN_ID
) {
  throw new Error('Reusing qualification requires a different completed run on trusted master')
}

function api(endpoint) {
  return JSON.parse(
    execFileSync('gh', ['api', `repos/${repository}/actions/${endpoint}`], {
      encoding: 'utf8'
    })
  )
}

const run = api(`runs/${id}`)
const head = run.head_sha
if (
  run.status !== 'completed' ||
  run.conclusion !== 'success' ||
  run.event !== 'workflow_dispatch' ||
  run.path !== workflow ||
  run.head_repository?.full_name !== repository ||
  !/^[a-f0-9]{40}$/.test(head ?? '')
) {
  throw new Error('Expected a successful manually qualified run of the fork workflow')
}
const { jobs } = api(`runs/${id}/jobs?filter=latest&per_page=100`)
const javascript = jobs.find((job) => job.name === 'javascript')
if (
  javascript?.conclusion !== 'success' ||
  ![
    'Verify formatting, localization and changed source',
    'Lint the composed source',
    'Run desktop and mobile unit tests'
  ].every((name) =>
    javascript.steps.some((step) => step.name === name && step.conclusion === 'success')
  )
) {
  throw new Error('The requested run did not execute and pass the full source qualification')
}

const root = process.cwd()
git(root, ['fetch', '--no-tags', 'origin', head])
const priorWorkflow = git(root, ['rev-parse', `${head}:${workflow}`])
const releaseWorkflow = git(root, ['rev-parse', `HEAD:${workflow}`])
if (
  ![releaseWorkflow, previousWorkflowBlob].includes(priorWorkflow) ||
  git(root, [
    'diff',
    '--name-only',
    head,
    'HEAD',
    '--',
    '.',
    `:(exclude)${workflow}`,
    ':(exclude)config/fork-build/qualification-reuse.mjs',
    ':(exclude)config/fork-build/MAINTENANCE.md'
  ])
) {
  throw new Error('Qualification used different build or verification controls')
}

const directory = resolve(output)
const planFile = join(directory, 'plan.json')
const plan = JSON.parse(readFileSync(planFile, 'utf8'))
const artifact = mkdtempSync(join(env.RUNNER_TEMP ?? tmpdir(), 'orca-qualification-'))
try {
  execFileSync('gh', [
    'run',
    'download',
    id,
    '--repo',
    repository,
    '--name',
    'personal-source-plan',
    '--dir',
    artifact
  ])
  const tested = JSON.parse(readFileSync(join(artifact, 'plan.json'), 'utf8'))
  if (
    tested.repository !== plan.repository ||
    tested.configuration !== head ||
    tested.auditOnly ||
    tested.error ||
    !tested.result?.publishable ||
    tested.upstream !== plan.upstream ||
    tested.result.tree !== plan.result.tree
  ) {
    throw new Error('The qualified source tree differs from the planned release')
  }
  const proof = {
    run: id,
    url: `https://github.com/${repository}/actions/runs/${id}`,
    configuration: head,
    source: tested.result.commit,
    tree: tested.result.tree
  }
  writeFileSync(planFile, `${JSON.stringify({ ...plan, qualification: proof }, null, 2)}\n`)
  appendFileSync(
    join(directory, 'report.md'),
    `\nFull source qualification reused from ${proof.url}.\n`
  )
  appendFileSync(env.GITHUB_OUTPUT, 'full_suite_reused=true\n')
} finally {
  rmSync(artifact, { recursive: true, force: true })
}
