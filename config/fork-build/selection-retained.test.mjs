import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSelection } from './selection.mjs'
import { renderReport } from './github.mjs'

const config = {
  base: 'main',
  authors: ['owner'],
  seed: [],
  include: [],
  exclude: {},
  replacements: {},
  dependencies: {},
  retainClosed: { 7: 'Handset regression still reproduces on main' }
}
const closed = (sha) => ({ number: 7, state: 'closed', base: { ref: 'main' }, head: { sha } })

test('retains an explicitly reviewed closed PR using its freshly read head', async () => {
  for (const sha of ['a'.repeat(40), 'b'.repeat(40)]) {
    const result = await resolveSelection(config, {
      openOwn: [],
      readPr: async () => closed(sha)
    })
    assert.deepEqual(result.blockers, [])
    assert.equal(result.selections.length, 1)
    assert.equal(result.selections[0].head.sha, sha)
    assert.deepEqual(result.lifecycle, [
      { number: 7, disposition: 'retained-closed', reason: config.retainClosed[7], head: sha }
    ])
  }
})

test('unreviewed closed PRs still block publication', async () => {
  const result = await resolveSelection(
    { ...config, retainClosed: {}, seed: [7] },
    {
      openOwn: [],
      readPr: async () => closed('a'.repeat(40))
    }
  )
  assert.equal(result.selections.length, 0)
  assert.equal(result.blockers[0].number, 7)
})

test('retention requires a reason and cannot conflict with retirement or replacement', async () => {
  for (const change of [
    { retainClosed: { 7: ' ' } },
    { exclude: { 7: 'Retired' } },
    { replacements: { 7: 8 } },
    { retainClosed: { bad: 'Invalid identity' } }
  ]) {
    await assert.rejects(
      resolveSelection(
        { ...config, ...change },
        {
          openOwn: [],
          readPr: async () => closed('a'.repeat(40))
        }
      ),
      /retention|retained|PR number/i
    )
  }
})

test('fork reports identify retained closed PRs and show the explicit reason', () => {
  const report = renderReport({
    configuration: 'config',
    upstream: 'main',
    auditOnly: true,
    blockers: [],
    selections: [closed('a'.repeat(40))],
    lifecycle: [{ number: 7, disposition: 'retained-closed', reason: config.retainClosed[7] }],
    result: {
      publishable: true,
      commit: 'source',
      tree: 'tree',
      conflicts: [],
      blockers: [],
      suppliedByUpstream: []
    }
  })
  assert.match(report, /PR 7 \| retained closed/)
  assert.match(report, /Handset regression still reproduces on main/)
  assert.doesNotMatch(report, /PR 7 \| open/)
})
