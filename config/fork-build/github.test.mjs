import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { afterEach, mock, test } from 'node:test'
import { api } from './github.mjs'

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
    if (attempted) return '{}'
    attempted = true
    throw failure
  })
  syncBuiltinESMExports()
  assert.throws(
    () => api('repos/example/app/issues/1', { body: 'update' }),
    (error) => error === failure
  )
})
