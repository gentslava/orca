import { afterEach, expect, it, vi } from 'vitest'
import { runProcess } from '@orca/process-host'
import { runPool, runTask } from './check-changed-task-runner.mjs'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('reports live progress, bounds the failure tail, and stops a task on timeout', async () => {
  vi.useFakeTimers()
  const logs = vi.fn()
  const output = { log: logs, stdout: vi.fn(), stderr: vi.fn() }
  let finish
  const task = {
    name: 'unit tests',
    steps: [
      { program: 'test-runner', args: ['run'], liveOutput: true },
      { program: 'must-not-run', args: [] }
    ]
  }
  const launch = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const pending = runTask(task, {
    root: '.',
    env: {},
    runProcess: launch,
    stepTimeoutMs: 30_000,
    output
  })
  await vi.advanceTimersByTimeAsync(15_000)
  expect(logs.mock.calls.flat().join('\n')).toContain('still running')
  expect(launch.mock.calls[0][0]).toMatchObject({
    timeoutMs: 30_000,
    terminationBarrier: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    onStdout: expect.any(Function)
  })
  finish({
    code: 0,
    signal: null,
    timedOut: true,
    stdout: `${'old\n'.repeat(500)}last diagnostic\n`,
    stderr: ''
  })
  const result = await pending
  expect(result.ok).toBe(false)
  expect(result.output).toContain('last diagnostic')
  expect(result.output).toContain('Timed out after 30s')
  expect(result.output).toContain('Command: "test-runner" "run"')
  expect(result.output.split('\n').length).toBeLessThan(210)
  expect(launch).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it('cancels a real process and never starts subsequent steps', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const abort = new AbortController()
  const task = {
    name: 'cancel',
    steps: [
      {
        program: process.execPath,
        args: ['-e', 'process.stderr.write("ready"); setInterval(() => {}, 1000)'],
        liveOutput: true
      },
      { program: 'must-not-run', args: [] }
    ]
  }
  const launch = (spec, capture) => runProcess({ ...spec, onStderr: () => abort.abort() }, capture)
  const result = await runTask(task, {
    root: process.cwd(),
    env: process.env,
    runProcess: launch,
    stepTimeoutMs: 10_000,
    signal: abort.signal
  })
  expect(result.ok).toBe(false)
  expect(result.output).toContain('ready')
  expect(result.output).toContain('Cancelled.')
})

it('caps concurrency while continuing independent checks after a failure', async () => {
  let active = 0
  let peak = 0
  const releases = []
  const pending = runPool([0, 1, 2], 2, async (task) => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => releases.push(resolve))
    active -= 1
    return { task, ok: task !== 0 }
  })
  expect(releases).toHaveLength(2)
  releases[0]()
  await vi.waitFor(() => expect(releases).toHaveLength(3))
  releases[1]()
  releases[2]()
  const results = await pending
  expect(peak).toBe(2)
  expect(results).toEqual(
    expect.arrayContaining([
      { task: 0, ok: false },
      { task: 1, ok: true },
      { task: 2, ok: true }
    ])
  )
})
