import assert from 'node:assert/strict'
import test from 'node:test'
import { withGitHubReadRetry } from './github-read-retry.mjs'

function githubReadFailure(stderr) {
  return Object.assign(new Error('GitHub read failed'), {
    stderr: Buffer.from(stderr),
    stdout: '{"partial":'
  })
}

for (const stderr of [
  'net/http: TLS handshake timeout',
  'HTTP 504: Gateway Timeout',
  'ECONNRESET'
]) {
  test(`returns the fresh response after a transient read failure: ${stderr}`, (t) => {
    t.mock.method(Atomics, 'wait', () => 'timed-out')
    const failure = githubReadFailure(stderr)
    const fresh = { sha: 'successful-retry' }
    let calls = 0
    const result = withGitHubReadRetry(() => {
      if (++calls === 1) {
        throw failure
      }
      return fresh
    })
    assert.equal(result, fresh)
    assert.equal(calls, 2)
  })
}

test('bounds repeated transport failures and preserves the final error', (t) => {
  t.mock.method(Atomics, 'wait', () => 'timed-out')
  const failure = githubReadFailure('net/http: TLS handshake timeout')
  let calls = 0
  assert.throws(
    () =>
      withGitHubReadRetry(() => {
        calls++
        throw failure
      }),
    (error) => error === failure
  )
  assert.equal(calls, 4)
})

for (const stderr of ['HTTP 403: API rate limit exceeded', 'HTTP 404: Not Found']) {
  test(`does not retry a permanent GitHub refusal: ${stderr}`, (t) => {
    t.mock.method(Atomics, 'wait', () => 'timed-out')
    const failure = githubReadFailure(stderr)
    let calls = 0
    assert.throws(
      () =>
        withGitHubReadRetry(() => {
          calls++
          throw failure
        }),
      (error) => error === failure
    )
    assert.equal(calls, 1)
  })
}
