import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runProcessSync, spawnProcess } from '@orca/process-host'
import { afterEach, expect, it, vi } from 'vitest'

const node = process.env.ORCA_TEST_NODE_EXECUTABLE ?? process.execPath
const temporary = []
const children = []
const pids = new Set()

function directory() {
  const root = mkdtempSync(join(tmpdir(), 'check-changed-lifecycle-'))
  temporary.push(root)
  return root
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return (
      process.platform !== 'linux' ||
      !readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].startsWith('Z')
    )
  } catch {
    return false
  }
}

function launch(
  script,
  cwd,
  args = [],
  { readStdout = true, detached = false, nodeArgs = [], ipc = false } = {}
) {
  const child = spawnProcess({
    program: node,
    args: [...nodeArgs, script, ...args],
    cwd,
    env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1' },
    detached,
    stdio: ['ignore', 'pipe', 'pipe', ...(ipc ? ['ipc'] : [])]
  })
  children.push(child)
  if (child.pid) {
    pids.add(child.pid)
  }
  let stdout = ''
  let stderr = ''
  if (readStdout) {
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
  }
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  const exited = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Outer command did not exit: ${stdout}\n${stderr}`)),
      12_000
    )
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal })
    })
  })
  return { child, exited, stdout: () => stdout, stderr: () => stderr }
}

function runner(root, body) {
  const script = join(root, 'runner.mjs')
  writeFileSync(
    script,
    `
    import { createRequire } from 'node:module'
    import { pathToFileURL } from 'node:url'
    import { readFileSync, writeFileSync } from 'node:fs'
    const require = createRequire(${JSON.stringify(resolve('src/packages/process-host/package.json'))})
    const { tsImport } = await import(pathToFileURL(require.resolve('tsx/esm/api')).href)
    const { runProcess } = await tsImport(${JSON.stringify(resolve('src/packages/process-host/src/run-process.ts'))}, import.meta.url)
    const { createTaskOutput, runTask } = await import(${JSON.stringify(pathToFileURL(resolve('config/scripts/check-changed-task-runner.mjs')).href)})
    ${body}
  `
  )
  return script
}

afterEach(async () => {
  for (const child of children.splice(0)) {
    child.stdout?.resume()
    child.kill('SIGKILL')
  }
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {}
  }
  await vi.waitFor(() => expect([...pids].filter(alive)).toEqual([]), { timeout: 5000 })
  pids.clear()
  temporary.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

it('exits after timeout when an escaped descendant holds stderr after root exit', async () => {
  const root = directory()
  const marker = join(root, 'pids.json')
  const leaf = `process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000)`
  const wrapper = join(root, 'wrapper.cjs')
  writeFileSync(
    wrapper,
    `
    const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(leaf)}], {
      detached: true, stdio: ['ignore', 'ignore', 'inherit', 'ipc'], windowsHide: true
    })
    require('node:fs').writeFileSync(${JSON.stringify(marker)}, JSON.stringify([process.pid, child.pid]))
    child.once('message', () => process.exit(0))
  `
  )
  const report = join(root, 'result.json')
  const script = runner(
    root,
    `
    const result = await runTask({ name: 'held pipe', steps: [{ program: process.execPath, args: [${JSON.stringify(wrapper)}] }] },
      { root: ${JSON.stringify(root)}, env: process.env, runProcess, stepTimeoutMs: 1000 })
    writeFileSync(${JSON.stringify(report)}, JSON.stringify(result))
    process.exitCode = result.ok ? 0 : 1
  `
  )
  const run = launch(script, root)
  await vi.waitFor(() => {
    const recorded = JSON.parse(readFileSync(marker, 'utf8'))
    recorded.forEach((pid) => pids.add(pid))
  })
  expect(await run.exited).toEqual({ code: 1, signal: null })
  const [wrapperPid, leafPid] = JSON.parse(readFileSync(marker, 'utf8'))
  expect(alive(wrapperPid)).toBe(false)
  expect(alive(leafPid)).toBe(true)
  const result = JSON.parse(readFileSync(report, 'utf8'))
  expect(result.output).toContain('Timed out after')
  expect(result.output).toContain('Cleanup unverified')
}, 15_000)

it('streams real stdout and stderr while retaining their bounded failure tails', async () => {
  const root = directory()
  const fixture = join(root, 'failure.cjs')
  const report = join(root, 'result.json')
  writeFileSync(
    fixture,
    `console.log('old\\n'.repeat(1000) + 'LAST_STDOUT_DIAGNOSTIC'); console.error('LAST_STDERR_DIAGNOSTIC'); process.exitCode = 2`
  )
  const script = runner(
    root,
    `
    const result = await runTask({ name: 'diagnostics', steps: [{ program: process.execPath, args: [${JSON.stringify(fixture)}], liveOutput: true }] },
      { root: ${JSON.stringify(root)}, env: process.env, runProcess, stepTimeoutMs: 1000 })
    writeFileSync(${JSON.stringify(report)}, JSON.stringify(result))
    process.exitCode = result.ok ? 0 : 1
  `
  )
  const run = launch(script, root)
  expect(await run.exited).toEqual({ code: 1, signal: null })
  expect(run.stdout()).toContain('LAST_STDOUT_DIAGNOSTIC')
  expect(run.stderr()).toContain('LAST_STDERR_DIAGNOSTIC')
  const result = JSON.parse(readFileSync(report, 'utf8'))
  expect(result.output).toContain('LAST_STDOUT_DIAGNOSTIC')
  expect(result.output).toContain('LAST_STDERR_DIAGNOSTIC')
  expect(result.output.split('\n').length).toBeLessThan(210)
})

it('cancels all active checks when a live output consumer closes', async () => {
  const root = directory()
  const marker = join(root, 'pids.json')
  const report = join(root, 'result.json')
  const script = runner(
    root,
    `
    const abort = new AbortController()
    const output = createTaskOutput(() => abort.abort())
    const recorded = []
    const launch = (spec, capture) => runProcess({ ...spec, onStderr: chunk => {
      recorded.push(Number(chunk.toString().trim()))
      writeFileSync(${JSON.stringify(marker)}, JSON.stringify(recorded))
      if (recorded.length === 2) output.stderr('BOTH_READY\\n')
      spec.onStderr?.(chunk)
    } }, capture)
    const tasks = [0, 1].map(index => ({ name: 'check ' + index, steps: [{ program: process.execPath,
      args: ['-e', 'process.stderr.write(String(process.pid)); setInterval(() => {}, 1000)'], liveOutput: true }] }))
    const pending = tasks.map(task => runTask(task, { root: ${JSON.stringify(root)}, env: process.env, runProcess: launch,
      stepTimeoutMs: 10000, signal: abort.signal, output }))
    const timer = setInterval(() => { if (recorded.length === 2) output.stderr('after consumer closed\\n') }, 100)
    try { writeFileSync(${JSON.stringify(report)}, JSON.stringify(await Promise.all(pending))) }
    finally { clearInterval(timer); await output.dispose() }
    process.exitCode = 1
  `
  )
  const run = launch(script, root)
  await vi.waitFor(() => expect(run.stderr()).toContain('BOTH_READY'))
  const recorded = JSON.parse(readFileSync(marker, 'utf8'))
  recorded.forEach((pid) => pids.add(pid))
  run.child.stderr.destroy()
  expect(await run.exited).toEqual({ code: 1, signal: null })
  expect(recorded).toHaveLength(2)
  expect(recorded.map(alive)).toEqual([false, false])
  const results = JSON.parse(readFileSync(report, 'utf8'))
  expect(
    results.every((result) => !result.ok && result.output.includes('Output consumer failed'))
  ).toBe(true)
}, 15_000)

function gateFixture({ build = '', formatter = '' } = {}) {
  const root = directory()
  const git = (...args) => {
    const result = runProcessSync({ program: 'git', args, cwd: root })
    expect(result.code, result.stderr).toBe(0)
  }
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  writeFileSync(join(root, '.gitignore'), 'config\nnode_modules\n.cache\n*.json\n*.mjs\n')
  writeFileSync(join(root, 'note.md'), '# Before\n')
  git('add', '.')
  git('commit', '-qm', 'base')
  const scripts = join(root, 'config/scripts')
  mkdirSync(scripts, { recursive: true })
  for (const name of [
    'build-workspace-packages',
    'run-vitest',
    'ensure-native-runtime',
    'check-changed-code-quality'
  ]) {
    writeFileSync(join(scripts, `${name}.mjs`), name === 'build-workspace-packages' ? build : '')
  }
  for (const name of ['oxfmt', 'oxlint']) {
    const packageDir = join(root, 'node_modules', name)
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(
      join(packageDir, 'package.json'),
      JSON.stringify({ name, bin: { [name]: 'cli.cjs' } })
    )
    writeFileSync(join(packageDir, 'cli.cjs'), name === 'oxfmt' ? formatter : '')
  }
  writeFileSync(join(root, 'note.md'), '# After\n')
  return root
}

it('bounds forwarding to a nonreading consumer and the actual gate still exits', async () => {
  const root = gateFixture({
    build: `for (let i = 0; i < 320; i++) process.stdout.write('x'.repeat(65536)); setTimeout(() => {}, 50)`
  })
  writeFileSync(join(root, 'input.ts'), 'export const value = 1\n')
  const report = join(root, 'peak.json')
  const preload = join(root, 'monitor.mjs')
  writeFileSync(
    preload,
    `
    import { writeFileSync } from 'node:fs'
    let peak = 0
    setInterval(() => { peak = Math.max(peak, process.stdout.writableLength) }, 1).unref()
    process.on('exit', () => writeFileSync(${JSON.stringify(report)}, JSON.stringify({ peak })))
  `
  )
  const run = launch(
    resolve('config/scripts/check-changed.mjs'),
    root,
    ['--scope=worktree', '--maxWorkers=2', '--stepTimeoutMs=10000'],
    { readStdout: false, nodeArgs: ['--import', pathToFileURL(preload).href] }
  )
  expect(await run.exited).toEqual({ code: 1, signal: null })
  const { peak } = JSON.parse(readFileSync(report, 'utf8'))
  expect(peak).toBeGreaterThan(0)
  expect(peak).toBeLessThanOrEqual(2 * 65536)
}, 15_000)

it('reports omitted live output when the consumer resumes before the final flush', async () => {
  const root = directory()
  const script = runner(
    root,
    `
    const output = createTaskOutput(() => {})
    for (let index = 0; index < 320; index++) output.stdout('x'.repeat(65536))
    process.stderr.write('RESUME_READER\\n')
    await new Promise(resolve => process.once('message', resolve))
    process.disconnect()
    await output.dispose()
  `
  )
  const run = launch(script, root, [], { readStdout: false, ipc: true })
  await vi.waitFor(() => expect(run.stderr()).toContain('RESUME_READER'))
  let stdout = ''
  run.child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  run.child.send('reading')
  expect(await run.exited).toEqual({ code: 0, signal: null })
  expect(stdout).toContain('live output omitted for a slow consumer')
})

it('does not cache a pass when the final summary output fails', async () => {
  const root = gateFixture()
  const preload = join(root, 'close-summary.mjs')
  writeFileSync(
    preload,
    `
    import { closeSync } from 'node:fs'
    const write = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk, ...args) => {
      if (String(chunk).includes('check(s) passed in')) closeSync(1)
      return write(chunk, ...args)
    }
  `
  )
  const run = launch(
    resolve('config/scripts/check-changed.mjs'),
    root,
    ['--scope=worktree', '--maxWorkers=2'],
    { nodeArgs: ['--import', pathToFileURL(preload).href] }
  )
  expect(await run.exited).toEqual({ code: 1, signal: null })
  expect(() => readFileSync(join(root, '.cache/check-changed.json'), 'utf8')).toThrow()
})

it.skipIf(process.platform === 'win32')(
  'cancels detached checks on terminal-group SIGHUP',
  async () => {
    const root = directory()
    const git = (...args) => {
      const result = runProcessSync({ program: 'git', args, cwd: root })
      expect(result.code, result.stderr).toBe(0)
    }
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'Test')
    writeFileSync(join(root, '.gitignore'), 'config\nnode_modules\n.cache\nformatter-pid\n')
    writeFileSync(join(root, 'note.md'), '# Before\n')
    git('add', '.')
    git('commit', '-qm', 'base')
    symlinkSync(resolve('config'), join(root, 'config'), 'dir')
    for (const name of ['oxfmt', 'oxlint']) {
      const packageDir = join(root, 'node_modules', name)
      mkdirSync(packageDir, { recursive: true })
      writeFileSync(
        join(packageDir, 'package.json'),
        JSON.stringify({ name, bin: { [name]: 'cli.cjs' } })
      )
      writeFileSync(
        join(packageDir, 'cli.cjs'),
        name === 'oxfmt'
          ? `require('node:fs').writeFileSync('formatter-pid', String(process.pid)); setInterval(() => {}, 1000)`
          : ''
      )
    }
    writeFileSync(join(root, 'note.md'), '# After\n')
    const run = launch(
      resolve('config/scripts/check-changed.mjs'),
      root,
      ['--scope=worktree', '--maxWorkers=2', '--stepTimeoutMs=10000'],
      { detached: true }
    )
    let formatterPid
    await vi.waitFor(
      () => {
        formatterPid = Number(readFileSync(join(root, 'formatter-pid'), 'utf8'))
        pids.add(formatterPid)
      },
      { timeout: 5000 }
    )
    process.kill(-run.child.pid, 'SIGHUP')
    expect(await run.exited).toEqual({ code: 1, signal: null })
    expect(alive(formatterPid)).toBe(false)
    expect(run.stderr()).toContain('Cancelled.')
  },
  15_000
)
