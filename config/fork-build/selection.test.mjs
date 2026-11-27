import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSelection, orderSelections } from './selection.mjs'

const pr = (number, extra = {}) => ({
  number,
  state: 'open',
  user: { login: 'me' },
  base: { ref: 'main' },
  head: { sha: 'a'.repeat(40) },
  ...extra
})
const config = {
  upstream: 'owner/app',
  base: 'main',
  authors: ['me'],
  seed: [1],
  include: [{ number: 2 }],
  exclude: {},
  replacements: {},
  dependencies: {}
}
test('retains closed own selections and follows only explicit replacements', async () => {
  const records = { 1: pr(1, { state: 'closed' }), 2: pr(2), 3: pr(3) }
  const readPr = async (n) => records[n]
  const failed = await resolveSelection(config, { openOwn: [], previous: [1], readPr })
  assert.equal(failed.blockers[0].number, 1)
  const replaced = await resolveSelection(
    { ...config, replacements: { 1: 3 } },
    { openOwn: [], previous: [1], readPr }
  )
  assert.deepEqual(
    replaced.selections.map((p) => p.number),
    [2, 3]
  )
  assert.equal(replaced.lifecycle[0].replacement, 3)
})
test('orders dependencies and rejects cycles or missing requirements', () => {
  assert.deepEqual(
    orderSelections([pr(2), pr(1)], { 1: [2] }).map((p) => p.number),
    [2, 1]
  )
  assert.throws(() => orderSelections([pr(1), pr(2)], { 1: [2], 2: [1] }), /cycle/)
  assert.throws(() => orderSelections([pr(1)], { 1: [4] }), /missing/)
})
test('discovers only allowed authors and bases, rejects unknown state and replacement cycles', async () => {
  const readPr = async (n) => pr(n, { state: 'closed' })
  const resolved = await resolveSelection(
    { ...config, seed: [], include: [] },
    {
      openOwn: [pr(4, { user: { login: 'other' } }), pr(5, { base: { ref: 'develop' } }), pr(6)],
      previous: [],
      readPr: async (n) => pr(n)
    }
  )
  assert.deepEqual(
    resolved.selections.map((p) => p.number),
    [6]
  )
  await assert.rejects(
    resolveSelection(
      { ...config, replacements: { 1: 2, 2: 1 } },
      { openOwn: [], previous: [], readPr }
    ),
    /cycle/
  )
  await assert.rejects(
    resolveSelection(config, {
      openOwn: [],
      previous: [],
      readPr: async (n) => pr(n, { state: 'mystery' })
    }),
    /state/
  )
})
