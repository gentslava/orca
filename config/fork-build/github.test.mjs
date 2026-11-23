import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { afterEach, mock, test } from 'node:test'
import { api, searchPullRequests } from './github.mjs'

afterEach(() => {
  mock.restoreAll()
  syncBuiltinESMExports()
})

test('a transient metadata failure still yields the current GitHub response', () => {
  let first = true
  mock.method(childProcess, 'execFileSync', () => {
    if (first) {
      first = false
      throw Object.assign(new Error('connection closed'), {
        stderr: 'Get https://api.github.com: EOF'
      })
    }
    return '{"object":{"sha":"current-head"}}'
  })
  syncBuiltinESMExports()
  assert.deepEqual(api('repos/example/app/git/ref/heads/main'), { object: { sha: 'current-head' } })
})

test('a failed mutation is not replayed', () => {
  const failure = Object.assign(new Error('connection closed'), { stderr: 'EOF' })
  let attempted = false
  mock.method(childProcess, 'execFileSync', () => {
    if (attempted) {
      return '{}'
    }
    attempted = true
    throw failure
  })
  syncBuiltinESMExports()
  assert.throws(
    () => api('repos/example/app/issues/1', { body: 'update' }),
    (error) => error === failure
  )
})

test('author discovery requires a complete, consistent multi-page inventory', () => {
  const first = Array.from({ length: 100 }, (_, index) => ({ number: index + 1 }))
  const page = (path) => ({
    total_count: 101,
    incomplete_results: false,
    items: path.endsWith('&page=1') ? first : [{ number: 101 }]
  })
  assert.equal(searchPullRequests('is:pr author:owner', page).at(-1).number, 101)
  assert.throws(
    () =>
      searchPullRequests('is:pr author:owner', (path) => ({
        ...page(path),
        items: path.endsWith('&page=1') ? first : [{ number: 100 }]
      })),
    /changed during pagination/
  )
})
