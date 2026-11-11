import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSelection } from './selection.mjs'
import { renderReport } from './github.mjs'

const source = { repository: 'owner/fork', ref: 'refs/heads/integration' }
const config = {
  base: 'main',
  authors: ['owner'],
  seed: [],
  include: [{ number: 7, reason: 'Reviewed CLI close command' }],
  exclude: {},
  replacements: {},
  dependencies: {},
  foreignHeadSources: { 7: source }
}
const original = {
  number: 7,
  state: 'open',
  user: { login: 'contributor' },
  base: { ref: 'main' },
  head: { sha: 'a'.repeat(40), ref: 'feature', repo: { full_name: 'contributor/fork' } }
}
const readers = {
  openOwn: [],
  readPr: async () => original,
  readRetainedHead: async () => 'b'.repeat(40)
}

test('pins an explicitly included foreign integration without losing original provenance', async () => {
  const result = await resolveSelection(config, readers)
  const selected = result.selections[0]
  assert.equal(selected.head.sha, 'b'.repeat(40))
  assert.equal(selected.head.repo.full_name, 'contributor/fork')
  assert.deepEqual(selected.foreignHeadSource, { ...source, originalHeadSha: original.head.sha })
  const report = renderReport({
    selections: [selected],
    blockers: [],
    lifecycle: result.lifecycle,
    result: {
      publishable: true,
      conflicts: [],
      blockers: [],
      suppliedByUpstream: []
    }
  })
  assert.ok(report.includes(original.head.sha))
  assert.ok(report.includes(`${source.repository}:${source.ref}`))
})

test('requires explicit inclusion, a trusted branch owner and readable branch identity', async () => {
  for (const change of [
    { include: [], seed: [7] },
    { include: [{ number: 7, reason: ' ' }] },
    { foreignHeadSources: { 7: { ...source, repository: 'untrusted/fork' } } },
    { retainClosed: { 7: 'Keep it' } },
    { exclude: { 7: 'Retired' } },
    { replacements: { 7: 8 } }
  ]) {
    await assert.rejects(resolveSelection({ ...config, ...change }, readers), /foreign|retention/i)
  }
  await assert.rejects(
    resolveSelection(config, { ...readers, readRetainedHead: undefined }),
    /identity/
  )
  await assert.rejects(
    resolveSelection(config, { ...readers, readRetainedHead: async () => 'bad' }),
    /head/
  )
  await assert.rejects(
    resolveSelection(config, {
      ...readers,
      readRetainedHead: async () => {
        throw new Error('branch missing')
      }
    }),
    /branch missing/
  )
  await assert.rejects(
    resolveSelection(config, {
      ...readers,
      readPr: async () => ({
        ...original,
        user: { login: 'owner' }
      })
    }),
    /identity/
  )
})

test('a foreign closure blocks instead of silently retaining the integration', async () => {
  const result = await resolveSelection(config, {
    ...readers,
    readPr: async () => ({ ...original, state: 'closed' }),
    readRetainedHead: async () => {
      throw new Error('must not read branch')
    }
  })
  assert.equal(result.selections.length, 0)
  assert.equal(result.blockers[0].number, 7)
})

test('a merged foreign PR uses the upstream merge without reading the integration branch', async () => {
  const merged = {
    ...original,
    state: 'closed',
    merged_at: '2026-11-12',
    merge_commit_sha: 'c'.repeat(40)
  }
  const result = await resolveSelection(config, {
    ...readers,
    readPr: async () => merged,
    readRetainedHead: async () => {
      throw new Error('must not read branch')
    }
  })
  assert.deepEqual(result.selections, [merged])
  assert.equal(result.lifecycle[0].disposition, 'merged-check-ancestry')
})
