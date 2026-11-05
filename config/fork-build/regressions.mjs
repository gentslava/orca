import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, appendFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { git } from './composition.mjs'

export function selectComposedRegressionSuites(paths) {
  const tests = paths.filter((path) => /\.test\.[cm]?[jt]sx?$/.test(path))
  return {
    desktop: tests.filter((path) => path.startsWith('src/')),
    mobile: tests.filter((path) => path.startsWith('mobile/src/')).map((path) => path.slice(7))
  }
}

export function runComposedRegressions(planPath, application) {
  const root = resolve(application)
  const plan = JSON.parse(readFileSync(resolve(planPath), 'utf8'))
  if (
    !plan.result?.publishable ||
    plan.error ||
    !/^[a-f0-9]{40}$/.test(plan.upstream || '') ||
    !/^[a-f0-9]{40}$/.test(plan.result.commit || '') ||
    git(root, ['rev-parse', 'HEAD']) !== plan.result.commit ||
    git(root, ['rev-parse', 'HEAD^{tree}']) !== plan.result.tree
  ) {
    throw new Error('Regression source does not match a publishable composition')
  }
  const paths = git(root, [
    'diff',
    '--name-only',
    '--diff-filter=AM',
    plan.upstream,
    plan.result.commit,
    '--',
    'src',
    'mobile/src'
  ])
    .split('\n')
    .filter(Boolean)
  const suites = selectComposedRegressionSuites(paths)
  const runner = join(root, 'config/scripts/test-runtime/execution-policy/run-vitest.mjs')
  for (const [name, files] of Object.entries(suites)) {
    for (const file of files) {
      const path = name === 'mobile' ? join('mobile', file) : file
      if (!existsSync(join(root, path))) {
        throw new Error(`Composed regression is missing: ${path}`)
      }
    }
    if (!files.length) {
      continue
    }
    console.log(`Running ${files.length} ${name} composed regression suites`)
    execFileSync(
      process.execPath,
      [
        runner,
        'run',
        '--config',
        name === 'mobile' ? 'mobile/vitest.config.ts' : 'config/vitest.config.ts',
        ...files,
        '--maxWorkers=2'
      ],
      {
        cwd: root,
        env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1' },
        stdio: 'inherit',
        windowsHide: true
      }
    )
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\nComposed regressions passed: ${suites.desktop.length} desktop and ${suites.mobile.length} mobile suites.\n`
    )
  }
  return suites
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [plan, application] = process.argv.slice(2)
  if (!plan || !application) {
    throw new Error('Expected plan.json and application directory')
  }
  runComposedRegressions(plan, application)
}
