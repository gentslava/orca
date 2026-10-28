import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runProcess, runProcessSync } from '@orca/process-host'
import { expect, it, vi } from 'vitest'
import { readPassHash } from './check-changed-pass-cache.mjs'
import { resolvePinnedBunExecutable } from './pinned-bun-executable.mjs'

it('keeps branch coverage after an iteration pass and never caches a timed-out gate', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-changed-gate-'))
  function git(...args) {
    const result = runProcessSync({ program: 'git', args, cwd: root })
    expect(result.code, result.stderr).toBe(0)
    return result.stdout.trim()
  }
  function check(...args) {
    return runProcessSync({
      program: process.env.ORCA_TEST_NODE_EXECUTABLE ?? process.execPath,
      args: [resolve('config/scripts/check-changed.mjs'), ...args, '--maxWorkers=2'],
      cwd: root,
      env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1' },
      timeoutMs: 30_000
    })
  }
  try {
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'Test')
    git('config', 'core.autocrlf', 'false')
    writeFileSync(join(root, '.gitignore'), '.cache/\nconfig\nnode_modules\n')
    git('add', '.')
    git('commit', '-qm', 'base')
    const base = git('rev-parse', 'HEAD')
    symlinkSync(resolve('config'), join(root, 'config'), 'junction')
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'junction')
    writeFileSync(join(root, 'committed.md'), '# Branch change\n')
    git('add', 'committed.md')
    git('commit', '-qm', 'branch change')

    const cleanIteration = check('--scope=worktree')
    expect(cleanIteration.code, cleanIteration.stderr).toBe(0)
    expect(cleanIteration.stdout).toContain('no changes against HEAD')

    writeFileSync(join(root, 'local.md'), '# Local change\n')
    const iteration = check('--scope=worktree')
    expect(iteration.code, iteration.stderr).toBe(0)
    expect(iteration.stdout).toContain('1 changed file(s) since HEAD')
    const iterationPass = readFileSync(join(root, '.cache/check-changed.json'), 'utf8')
    expect(check('--scope=worktree').stdout).toContain('nothing changed since last passing run')

    const timedOut = check(`--base=${base}`, '--stepTimeoutMs=1')
    expect(timedOut.code).toBe(1)
    expect(timedOut.stderr).toContain('Timed out after')
    expect(readFileSync(join(root, '.cache/check-changed.json'), 'utf8')).toBe(iterationPass)

    const branch = check(`--base=${base}`)
    expect(branch.code, branch.stderr).toBe(0)
    expect(branch.stdout).toContain('2 changed file(s)')
    expect(branch.stdout).not.toContain('nothing changed since last passing run')
    expect(check(`--base=${base}`).stdout).toContain('nothing changed since last passing run')
    expect(check('--scope=worktree').stdout).toContain('nothing changed since last passing run')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 60_000)

function gateFixture() {
  const root = mkdtempSync(join(tmpdir(), 'check-changed-integrity-'))
  function git(...args) {
    const result = runProcessSync({ program: 'git', args, cwd: root })
    expect(result.code, result.stderr).toBe(0)
    return result.stdout.trim()
  }
  function write(file, contents) {
    mkdirSync(join(root, file, '..'), { recursive: true })
    writeFileSync(join(root, file), contents)
  }
  function checkSpec(args = [], env = {}) {
    return {
      program: process.env.ORCA_TEST_NODE_EXECUTABLE ?? process.execPath,
      args: [resolve('config/scripts/check-changed.mjs'), '--maxWorkers=1', ...args],
      cwd: root,
      env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1', ...env },
      timeoutMs: 30_000
    }
  }
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  git('config', 'core.autocrlf', 'false')
  write('.gitignore', '.cache/\nconfig/\nnode_modules\n')
  write('.oxfmtrc.json', '{"semi":false}\n')
  write('sample.md', '# Original\n')
  git('add', '.')
  git('commit', '-qm', 'base')
  const base = git('rev-parse', 'HEAD')
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'junction')
  write(
    'config/scripts/check-changed-code-quality.mjs',
    `
    import { existsSync, readFileSync, writeFileSync } from 'node:fs'
    import { setTimeout } from 'node:timers/promises'
    if (process.env.ORCA_BALANCE_UNIT_SHARDS !== '0') throw Error('inherited sharding')
    if (process.env.ORCA_UNIT_INVENTORY !== process.env.EXPECTED_INVENTORY) throw Error('inventory')
    const mode = readFileSync('.cache/control', 'utf8')
    if (mode === 'fail') process.exitCode = 1
    if (mode === 'mutate') writeFileSync('sample.md', '# Good\\n')
    if (process.env.ORCA_GATE_DELAYED_FAILURE === '1' || process.env.ORCA_GATE_WAIT === '1') {
      writeFileSync('.cache/waiting', '')
      while (!existsSync('.cache/release')) await setTimeout(10)
      if (process.env.ORCA_GATE_DELAYED_FAILURE === '1') process.exitCode = 1
    }
  `
  )
  write('.cache/control', 'pass')
  return {
    root,
    base,
    git,
    write,
    check: (...args) => runProcessSync(checkSpec(...args)),
    startCheck: (...args) => runProcess(checkSpec(...args))
  }
}

function configureGateVitest({ root, write }) {
  write('config/.bun-version', readFileSync(resolve('config/.bun-version')))
  for (const script of ['build-workspace-packages', 'ensure-native-runtime']) {
    write(`config/scripts/${script}.mjs`, '')
  }
  const bun = resolvePinnedBunExecutable(process.cwd(), runProcessSync)
  expect(bun).toBeTruthy()
  write(
    'config/vitest.config.ts',
    `export default {
      root: ${JSON.stringify(root)}, cacheDir: ${JSON.stringify(join(root, '.cache/vitest'))},
      test: { include: ['tests/tools/*.test.mjs'], maxWorkers: 1,
        experimental: { recordDependencies: true } }
    }`
  )
  write(
    'config/scripts/run-vitest.mjs',
    `
      import { runProcessSync } from '@orca/process-host'
      const result = runProcessSync({
        program: ${JSON.stringify(bun)},
        args: ['--bun', ${JSON.stringify(resolve('node_modules/vitest/vitest.mjs'))}, ...process.argv.slice(2)],
        cwd: process.cwd(), env: process.env, timeoutMs: 10000
      })
      process.stdout.write(result.stdout)
      process.stderr.write(result.stderr)
      process.exitCode = result.code ?? 1
    `
  )
  return (...selection) =>
    runProcessSync({
      program: bun,
      args: [
        '--bun',
        resolve('node_modules/vitest/vitest.mjs'),
        ...selection,
        '--config',
        'config/vitest.config.ts'
      ],
      cwd: root,
      env: {
        ...process.env,
        ORCA_UNIT_INVENTORY: 'ci',
        ORCA_BALANCE_UNIT_SHARDS: '0',
        ORCA_BACKGROUND_LAUNCH: '1'
      },
      timeoutMs: 10_000
    })
}

it('removes a concurrent matching pass when an older forced check finishes with failure', async () => {
  const { root, base, write, check, startCheck } = gateFixture()
  const args = [`--base=${base}`]
  const env = { EXPECTED_INVENTORY: 'local' }
  let delayed
  try {
    write('sample.md', '# Changed\n')
    const iteration = check(['--scope=worktree'], { EXPECTED_INVENTORY: 'ci' })
    expect(iteration.code, iteration.stderr).toBe(0)
    const iterationHash = readPassHash(root, 'worktree')
    delayed = startCheck([...args, '--force'], { ...env, ORCA_GATE_DELAYED_FAILURE: '1' })
    await vi.waitFor(() => expect(existsSync(join(root, '.cache/waiting'))).toBe(true), {
      timeout: 10_000
    })
    const successful = check(args, env)
    expect(successful.code, successful.stderr).toBe(0)
    expect(readPassHash(root)).toBeTruthy()
    write('.cache/release', '')
    expect((await delayed).code).toBe(1)
    expect(readPassHash(root)).toBeNull()
    expect(readPassHash(root, 'worktree')).toBe(iterationHash)
  } finally {
    if (delayed) {
      write('.cache/release', '')
      await delayed
    }
    rmSync(root, { recursive: true, force: true })
  }
}, 60_000)

it('rehashes changed inputs, separates CI passes, and invalidates a forced failed recheck', () => {
  const fixture = gateFixture()
  const { root, base, git, write } = fixture
  const branchArgs = [`--base=${base}`]
  const branchEnv = { EXPECTED_INVENTORY: 'local', ORCA_BALANCE_UNIT_SHARDS: '1', CI: '' }
  const check = (args = branchArgs, env = {}) => fixture.check(args, { ...branchEnv, ...env })
  try {
    write('sample.md', '# Changed\n')
    const ci = check(branchArgs, { CI: '1' })
    expect(ci.code, ci.stderr).toBe(0)
    const local = check()
    expect(local.code, local.stderr).toBe(0)
    expect(local.stdout).not.toContain('nothing changed since last passing run')
    const iteration = check(['--scope=worktree'], { EXPECTED_INVENTORY: 'ci' })
    expect(iteration.code, iteration.stderr).toBe(0)
    const iterationHash = readPassHash(root, 'worktree')

    write('.cache/control', 'fail')
    expect(check([...branchArgs, '--force']).code).toBe(1)
    expect(readPassHash(root)).toBeNull()
    expect(readPassHash(root, 'worktree')).toBe(iterationHash)
    const failedRetry = check()
    expect(failedRetry.code).toBe(1)
    expect(failedRetry.stdout).not.toContain('nothing changed since last passing run')

    write('.cache/control', 'mutate')
    write('sample.md', '# Bad\n\n-   bad\n')
    const mutated = check()
    expect(mutated.code).toBe(1)
    expect(mutated.stderr).toContain('inputs changed during checks')
    expect(readPassHash(root)).toBeNull()
    write('.cache/control', 'pass')
    write('sample.md', '# Bad\n\n-   bad\n')
    expect(check().code).toBe(1)

    git('update-ref', 'refs/remotes/origin/main', base)
    const invalid = check(['--base=missing-review-base'])
    expect(invalid.code).toBe(1)
    expect(invalid.stderr).toContain('Invalid --base=missing-review-base')
    const emptyBase = check(['--base='])
    expect(emptyBase.code).toBe(1)
    expect(emptyBase.stderr).toContain('Invalid --base=')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 60_000)

it.each(['cold', 'recorded'])(
  'runs a deleted dependency consumer with %s records',
  (records) => {
    const fixture = gateFixture()
    const { root, git, write, check } = fixture
    try {
      write('value.mjs', 'export const value = 1\n')
      write(
        'tests/tools/deleted-consumer.test.mjs',
        `
      import { expect, it } from 'vitest'
      import { value } from '../../value.mjs'
      it('loads its dependency', () => expect(value).toBe(1))
    `
      )
      git('add', 'value.mjs', 'tests')
      git('commit', '-qm', 'consumer')
      const vitest = configureGateVitest(fixture)
      if (records === 'recorded') {
        const warm = vitest('run')
        expect(warm.code, warm.stderr).toBe(0)
      }
      rmSync(join(root, 'value.mjs'))
      const result = check(['--scope=worktree'], { EXPECTED_INVENTORY: 'ci' })
      expect(result.code).toBe(1)
      expect(result.stdout).toContain('unit tests')
      expect(result.stderr).toContain('value.mjs')
      expect(readPassHash(root, 'worktree')).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
  60_000
)

function computedConsumerFixture() {
  const fixture = gateFixture()
  const { git, write } = fixture
  write('value.mjs', 'export const value = 1\n')
  write(
    'loader.mjs',
    `export async function load() { const file = './value.mjs'; return (await import(file)).value }\n`
  )
  write(
    'tests/tools/static.test.mjs',
    `import {expect,it} from 'vitest'; import {value} from '../../value.mjs'; it('static consumer', () => expect(value).toBeGreaterThan(0))\n`
  )
  write(
    'tests/tools/dynamic.test.mjs',
    `import {expect,it} from 'vitest'; import {load} from '../../loader.mjs'; it('computed consumer', async () => expect(await load()).toBe(1))\n`
  )
  for (let index = 0; index < 102; index++) {
    write(
      `tests/tools/cold-${index}.test.mjs`,
      `import {it} from 'vitest'; it('unrelated', () => {})\n`
    )
  }
  git('add', 'value.mjs', 'loader.mjs', 'tests')
  git('commit', '-qm', 'computed consumers')
  const vitest = configureGateVitest(fixture)
  write('value.mjs', 'export const value = 2\n')
  return { ...fixture, vitest }
}

it.each(['failure', 'timeout'])(
  'fails the gate when dependency path resolution has a %s',
  (mode) => {
    const fixture = gateFixture()
    const { root, write, check } = fixture
    try {
      configureGateVitest(fixture)
      write('value.mjs', 'export const value = 2\n')
      write(
        'config/vitest.config.ts',
        mode === 'failure'
          ? `throw new Error('configuration resolution failed'); export default {}\n`
          : `export default async () => { await new Promise(() => {}); return {} }\n`
      )
      const result = check(['--scope=worktree', '--stepTimeoutMs=1000'], {
        EXPECTED_INVENTORY: 'ci'
      })
      expect(result.code).toBe(1)
      expect(result.stderr).toContain('✗ dependency evidence')
      expect(result.stderr).toContain(
        mode === 'failure' ? 'configuration resolution failed' : 'Timed out after 1s'
      )
      expect(result.stdout).not.toContain('▶ unit tests')
      expect(readPassHash(root, 'worktree')).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
  30_000
)

it('invalidates a cached gate when an unchanged computed consumer records a failure', () => {
  const { root, check, vitest } = computedConsumerFixture()
  const args = ['--scope=worktree']
  const env = { EXPECTED_INVENTORY: 'ci' }
  try {
    const initial = check(args, env)
    expect(initial.code, initial.stderr).toBe(0)
    expect(initial.stdout).toContain('1 of 104 test files')
    // The gate's own successful dependency update must be cacheable immediately.
    const cached = check(args, env)
    expect(cached.code, cached.stderr).toBe(0)
    expect(cached.stdout).toContain('nothing changed since last passing run')
    expect(vitest('run', 'tests/tools/dynamic.test.mjs').code).toBe(1)
    expect(readPassHash(root, 'worktree')).toBeNull()
    const retry = check(args, env)
    expect(retry.code).toBe(1)
    expect(retry.stdout).not.toContain('nothing changed since last passing run')
    expect(retry.stderr).toContain('computed consumer')
    expect(readPassHash(root, 'worktree')).toBeNull()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 60_000)

it('rejects failed dependency evidence arriving after unit tests while another check is active', async () => {
  const { root, write, check, startCheck, vitest } = computedConsumerFixture()
  const args = ['--scope=worktree']
  const env = { EXPECTED_INVENTORY: 'ci' }
  let pending
  try {
    pending = startCheck(args, { ...env, ORCA_GATE_WAIT: '1' })
    // With one worker, quality starts only after the selected static unit suite passes.
    await vi.waitFor(() => expect(existsSync(join(root, '.cache/waiting'))).toBe(true), {
      timeout: 10_000
    })
    expect(vitest('run', 'tests/tools/dynamic.test.mjs').code).toBe(1)
    write('.cache/release', '')
    const result = await pending
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('new incomplete dependency evidence')
    expect(readPassHash(root, 'worktree')).toBeNull()
    const retry = check(args, env)
    expect(retry.code).toBe(1)
    expect(retry.stderr).toContain('computed consumer')
  } finally {
    if (pending) {
      write('.cache/release', '')
      await pending
    }
    rmSync(root, { recursive: true, force: true })
  }
}, 60_000)
