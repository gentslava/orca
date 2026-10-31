import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveSelection, orderSelections } from './selection.mjs'
import { compose } from './composition.mjs'

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
function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}
function fixture(run) {
  const cwd = mkdtempSync(join(tmpdir(), 'plus-test-'))
  try {
    git(cwd, 'init', '-b', 'main')
    git(cwd, 'config', 'user.name', 'Plus test')
    git(cwd, 'config', 'user.email', 'plus@example.invalid')
    writeFileSync(join(cwd, 'file'), 'base\n')
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'base')
    run(cwd)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
}
test('real Git: clean merge, direct conflict, combination conflict and merged ancestry', () =>
  fixture((cwd) => {
    const upstream = git(cwd, 'rev-parse', 'HEAD')
    function branch(name, text, path = 'file') {
      git(cwd, 'checkout', '-B', name, upstream)
      writeFileSync(join(cwd, path), text)
      git(cwd, 'add', '.')
      git(cwd, 'commit', '-m', name)
      return git(cwd, 'rev-parse', 'HEAD')
    }
    const one = branch('one', 'one\n'),
      two = branch('two', 'two\n'),
      three = branch('three', 'three\n', 'other')
    git(cwd, 'checkout', '-B', 'new-main', upstream)
    writeFileSync(join(cwd, 'other'), 'upstream\n')
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'upstream')
    const fresh = git(cwd, 'rev-parse', 'HEAD')
    const result = compose(
      cwd,
      fresh,
      [
        { ...pr(1), head: { sha: one } },
        { ...pr(2), head: { sha: two } },
        { ...pr(3), head: { sha: three } },
        { ...pr(4), state: 'closed', merged_at: 'date', merge_commit_sha: upstream }
      ],
      { timestamp: '2026-10-31T00:00:00Z' }
    )
    assert.equal(result.included[0].number, 1)
    assert.deepEqual(
      result.conflicts.map((p) => [p.number, p.kind]),
      [
        [2, 'combination'],
        [3, 'upstream']
      ]
    )
    assert.deepEqual(result.suppliedByUpstream, [4])
    assert.equal(result.publishable, false)
    assert.equal(git(cwd, 'show', `${result.commit}:file`), 'one')
  }))
test('real Git: merged after frozen upstream blocks publication', () =>
  fixture((cwd) => {
    const upstream = git(cwd, 'rev-parse', 'HEAD')
    writeFileSync(join(cwd, 'later'), 'x')
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'later')
    const later = git(cwd, 'rev-parse', 'HEAD')
    const result = compose(cwd, upstream, [
      { ...pr(1), state: 'closed', merged_at: 'date', merge_commit_sha: later }
    ])
    assert.equal(result.publishable, false)
    assert.match(result.blockers[0].reason, /frozen/)
  }))
