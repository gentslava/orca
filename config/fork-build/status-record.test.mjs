import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextRecord } from './status-record.mjs'
test('failed builds retain the last good release and all previously tracked PRs', () => {
  const old = {
    runId: '10',
    tracked: [1, 2],
    lastGood: { tag: 'personal-9-1', fingerprint: 'old' }
  }
  const plan = { tracked: [3], fingerprint: 'new', result: { commit: 'a'.repeat(40) } }
  const failed = nextRecord(old, plan, { runId: '11', attempt: '1', publication: 'failure' })
  assert.deepEqual(failed.lastGood, old.lastGood)
  assert.deepEqual(failed.tracked, [1, 2, 3])
  const published = nextRecord(old, plan, { runId: '11', attempt: '2', publication: 'success' })
  assert.equal(published.lastGood.tag, 'personal-11-2')
  assert.equal(published.lastGood.fingerprint, 'new')
  assert.equal(published.lastGood.promoted, false)
  const synced = nextRecord(published, plan, {
    runId: '12',
    attempt: '1',
    publication: 'success',
    branchSync: 'success'
  })
  assert.equal(synced.lastGood.promoted, true)
  assert.equal(nextRecord(published, plan, { runId: '10', publication: 'success' }), null)
})
