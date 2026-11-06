import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { git, readPublishableComposition } from './composition.mjs'

export async function runComposedSourceChecks(planPath, application) {
  const { root, plan } = readPublishableComposition(planPath, application)
  const paths = git(root, ['diff', '--name-only', '--diff-filter=ACMR', plan.upstream, 'HEAD'])
    .split('\n')
    .filter((file) => file && existsSync(join(root, file)))
  const { resolveOxcCliInvocation } = await import(
    pathToFileURL(join(root, 'config/scripts/tool-invocation/oxc-cli-invocation.mjs')).href
  )
  const formatter = resolveOxcCliInvocation('oxfmt', 'oxfmt', root)
  const options = {
    cwd: root,
    env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1' },
    stdio: 'inherit',
    windowsHide: true
  }
  execFileSync(formatter.command, [...formatter.prefixArgs, '--check', ...paths], options)
  execFileSync(
    process.execPath,
    ['config/scripts/preflight/changed-checks/check-changed-code-quality.mjs', plan.upstream],
    options
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [plan, application] = process.argv.slice(2)
  if (!plan || !application) {
    throw new Error('Expected plan.json and application directory')
  }
  await runComposedSourceChecks(plan, application)
}
