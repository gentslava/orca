import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requireCurrentUpstream } from './upstream-freshness.mjs'

const head = 'a'.repeat(40)
const plan = { repository: 'stablyai/orca', upstream: head }

test('allows publication while upstream main still matches the built source', () => {
  assert.equal(
    requireCurrentUpstream(plan, () => `${head}\trefs/heads/main\n`),
    head
  )
})

test('refuses an upstream update that arrives while the platforms are building', () => {
  assert.throws(
    () => requireCurrentUpstream(plan, () => `${'b'.repeat(40)}\trefs/heads/main`),
    /Upstream main moved.*rerun composition and checks/
  )
})

test('rejects an invalid source identity before reading remote state', () => {
  assert.throws(
    () =>
      requireCurrentUpstream({ ...plan, repository: 'other/repo' }, () => {
        assert.fail('An invalid plan must not reach the network')
      }),
    /Invalid upstream identity/
  )
})

test('does not accept an ambiguous remote reply as a freshness proof', () => {
  assert.throws(
    () => requireCurrentUpstream(plan, () => `${head}\trefs/heads/main\n${head}\trefs/heads/other`),
    /Could not verify/
  )
})
