import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isDirectInvocation } from './tool-invocation/script-entry-detection.mjs'

const { desktop, mobile } = JSON.parse(
  readFileSync(new URL('../fork-build/legacy-preview-regressions.json', import.meta.url), 'utf8')
)

export function runForkRegressions(root = process.cwd()) {
  for (const file of [...desktop, ...mobile.map((file) => join('mobile', file))]) {
    if (!existsSync(join(root, file))) {
      throw new Error(`Required fork regression suite disappeared: ${file}`)
    }
  }
  const env = { ...process.env, ORCA_BACKGROUND_LAUNCH: '1' }
  for (const [script, ...args] of [
    ['plugin-authoring/rpc-catalog/generate-rpc-params-catalog.mjs', '--check'],
    ['localization/catalog-validation/verify-localization-catalogs.mjs'],
    ['localization/source-extraction/verify-localization-extraction.mjs'],
    ['localization/source-extraction/audit-localization-coverage.mjs', '--check']
  ]) {
    execFileSync(process.execPath, [resolve(root, 'config/scripts', script), ...args], {
      cwd: root,
      env,
      stdio: 'inherit'
    })
  }
  execFileSync(
    process.execPath,
    [
      resolve(root, 'config/scripts/test-runtime/execution-policy/run-vitest.mjs'),
      'run',
      '--config',
      'config/vitest.config.ts',
      ...desktop,
      '--maxWorkers=2'
    ],
    { cwd: root, env, stdio: 'inherit' }
  )
  execFileSync(
    process.execPath,
    [resolve(root, 'mobile/node_modules/vitest/vitest.mjs'), 'run', ...mobile, '--maxWorkers=2'],
    { cwd: resolve(root, 'mobile'), env, stdio: 'inherit' }
  )
}

if (isDirectInvocation(import.meta.url, process.argv[1])) {
  runForkRegressions()
}
