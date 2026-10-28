const OUTPUT_TAIL_LINES = 200
const HEARTBEAT_MS = 15_000
const LIVE_OUTPUT_QUEUE_BYTES = 64 * 1024
const OUTPUT_FLUSH_MS = 250

export function createTaskOutput(cancel) {
  let failure
  let blocked = false
  let disposing = false
  const targets = [process.stdout, process.stderr].map((stream) => {
    let dropped = false
    let closed = false
    const fail = (error) => {
      closed = true
      failure ??= `Output consumer failed: ${error.message ?? error}`
      cancel()
    }
    const onClose = () => {
      if (!disposing) {
        fail(new Error('stream closed'))
      }
    }
    stream.on('error', fail)
    stream.on('close', onClose)
    const write = (chunk) => {
      if (closed || stream.destroyed) {
        return
      }
      if (stream.writableNeedDrain || stream.writableLength >= LIVE_OUTPUT_QUEUE_BYTES) {
        dropped = true
        return
      }
      try {
        if (dropped) {
          dropped = false
          if (
            !stream.write(
              '… live output omitted for a slow consumer; failure diagnostics are retained.\n'
            )
          ) {
            dropped = true
            return
          }
        }
        stream.write(chunk)
      } catch (error) {
        fail(error)
      }
    }
    const drain = () =>
      new Promise((resolve) => {
        if (closed || stream.destroyed || !stream.writableLength) {
          setImmediate(resolve)
          return
        }
        const timer = setTimeout(() => {
          blocked = true
          fail(new Error('stream did not drain'))
          stream.unref?.()
          setImmediate(resolve)
        }, OUTPUT_FLUSH_MS)
        stream.write('', () => {
          clearTimeout(timer)
          setImmediate(resolve)
        })
      })
    const flush = async () => {
      await drain()
      if (dropped && !closed) {
        write('')
        await drain()
      }
    }
    return {
      write,
      flush,
      dispose: () => {
        stream.off('error', fail)
        stream.off('close', onClose)
      }
    }
  })
  return {
    get failure() {
      return failure
    },
    get blocked() {
      return blocked
    },
    stdout: targets[0].write,
    stderr: targets[1].write,
    log: (message) => targets[0].write(`${message}\n`),
    error: (message) => targets[1].write(`${message}\n`),
    flush: () => Promise.all(targets.map((target) => target.flush())),
    async dispose() {
      disposing = true
      await Promise.all(targets.map((target) => target.flush()))
      targets.forEach((target) => target.dispose())
    }
  }
}

function elapsed(startedAt) {
  return `${((performance.now() - startedAt) / 1000).toFixed(1)}s`
}

export function outputTail(text) {
  const lines = text.trimEnd().split(/\r?\n/)
  return lines.length <= OUTPUT_TAIL_LINES
    ? lines.join('\n')
    : [
        `… ${lines.length - OUTPUT_TAIL_LINES} earlier lines omitted`,
        ...lines.slice(-OUTPUT_TAIL_LINES)
      ].join('\n')
}

export async function runTask(
  task,
  { root, env, runProcess, stepTimeoutMs, signal, output: sharedOutput }
) {
  const abort = new AbortController()
  const cancel = () => abort.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) {
    cancel()
  }
  const live = sharedOutput ?? createTaskOutput(cancel)
  const startedAt = performance.now()
  let output = ''
  try {
    for (const [index, { program, args, liveOutput }] of task.steps.entries()) {
      if (abort.signal.aborted) {
        return { task, ok: false, output: `${output}\nCancelled.`, elapsed: elapsed(startedAt) }
      }
      const command = [program, ...args].map((argument) => JSON.stringify(argument)).join(' ')
      const label = `${task.name} [${index + 1}/${task.steps.length}]`
      live.log(`▶ ${label}: ${command} (deadline ${stepTimeoutMs / 1000}s)`)
      const heartbeat = setInterval(() => {
        live.log(`… ${label} still running (${elapsed(startedAt)} elapsed)`)
      }, HEARTBEAT_MS)
      try {
        const result = await runProcess(
          {
            program,
            args,
            cwd: root,
            env,
            timeoutMs: stepTimeoutMs,
            maxOutputBytes: 256 * 1024,
            signal: abort.signal,
            detached: process.platform !== 'win32',
            terminationBarrier: true,
            ...(liveOutput
              ? {
                  stdio: ['ignore', 'pipe', 'pipe'],
                  onStdout: live.stdout,
                  onStderr: live.stderr
                }
              : {})
          },
          'tail'
        )
        output = outputTail(output + result.stdout + result.stderr)
        if (!sharedOutput) {
          await live.flush()
        }
        if (
          result.timedOut ||
          abort.signal.aborted ||
          result.code !== 0 ||
          result.terminationUnverified
        ) {
          const reason = result.timedOut
            ? `Timed out after ${stepTimeoutMs / 1000}s; increase --stepTimeoutMs=<ms> for a longer run.`
            : abort.signal.aborted
              ? (live.failure ?? 'Cancelled.')
              : `Exited with ${result.signal ?? result.code}.`
          const cleanup = result.terminationUnverified
            ? '\nCleanup unverified: output pipes remained open or tree termination was not confirmed; escaped descendants may remain.'
            : ''
          return {
            task,
            ok: false,
            output: `${output}\n${reason}${cleanup}\nCommand: ${command}`,
            elapsed: elapsed(startedAt)
          }
        }
      } catch (error) {
        return {
          task,
          ok: false,
          output: `${output}\n${error.message ?? error}\nCommand: ${command}`,
          elapsed: elapsed(startedAt)
        }
      } finally {
        clearInterval(heartbeat)
      }
    }
    live.log(`✓ ${task.name} (${elapsed(startedAt)})`)
    return { task, ok: true, output, elapsed: elapsed(startedAt) }
  } finally {
    signal?.removeEventListener('abort', cancel)
    if (!sharedOutput) {
      await live.dispose()
    }
  }
}

export async function runPool(tasks, concurrency, run) {
  const results = []
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
      while (next < tasks.length) {
        results.push(await run(tasks[next++]))
      }
    })
  )
  return results
}
