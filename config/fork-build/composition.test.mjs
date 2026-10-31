import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveSelection, orderSelections } from './selection.mjs'
import { compose, assertFrozenHead } from './composition.mjs'
import { mergeTranslationCatalogs } from './locale-merge.mjs'

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

test('real Git: rejects a PR ref that moved after metadata resolution', () =>
  fixture((cwd) => {
    const frozen = git(cwd, 'rev-parse', 'HEAD')
    git(cwd, 'update-ref', 'refs/personal/pr-1', frozen)
    assertFrozenHead(cwd, 1, frozen)
    writeFileSync(join(cwd, 'next'), 'next')
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'moved')
    git(cwd, 'update-ref', 'refs/personal/pr-1', 'HEAD')
    assert.throws(() => assertFrozenHead(cwd, 1, frozen), /moved after snapshot/)
  }))

test('real Git: combines independent locale keys and still blocks divergent translations', () =>
  fixture((cwd) => {
    const path = 'src/renderer/src/i18n/locales/en.json'
    mkdirSync(join(cwd, 'src/renderer/src/i18n/locales'), { recursive: true })
    const padding = 'x'.repeat(1024 * 1024)
    writeFileSync(
      join(cwd, path),
      JSON.stringify({ padding, settings: { existing: 'Existing' } }, null, 2)
    )
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'locale base')
    const upstream = git(cwd, 'rev-parse', 'HEAD')
    function branch(name, values) {
      git(cwd, 'checkout', '-B', name, upstream)
      writeFileSync(join(cwd, path), JSON.stringify({ padding, settings: values }, null, 2))
      git(cwd, 'add', '.')
      git(cwd, 'commit', '-m', name)
      return git(cwd, 'rev-parse', 'HEAD')
    }
    const one = branch('one', { existing: 'Existing', first: 'One' })
    const two = branch('two', { existing: 'Existing', second: 'Two' })
    const conflict = branch('conflict', { existing: 'Existing', first: 'Different' })
    const result = compose(
      cwd,
      upstream,
      [one, two, conflict].map((sha, index) => ({
        ...pr(index + 1),
        head: { sha }
      }))
    )
    assert.deepEqual(
      result.included.map((entry) => entry.number),
      [1, 2]
    )
    const merged = JSON.parse(
      execFileSync('git', ['show', `HEAD:${path}`], {
        cwd,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024
      })
    )
    assert.deepEqual(merged, {
      padding,
      settings: { existing: 'Existing', first: 'One', second: 'Two' }
    })
    assert.deepEqual(result.localeMerges, [{ number: 2, paths: [path] }])
    assert.deepEqual(
      result.conflicts.map((entry) => [entry.number, entry.kind]),
      [[3, 'combination']]
    )
    assert.equal(result.publishable, false)
  }))

test('locale policy retains removals but refuses delete/edit races, duplicate keys and non-catalog values', () => {
  assert.deepEqual(
    JSON.parse(
      mergeTranslationCatalogs(
        '{"keep":"Keep","remove":"Old"}',
        '{"keep":"Keep"}',
        '{"keep":"Keep","remove":"Old","new":"New"}'
      )
    ),
    { keep: 'Keep', new: 'New' }
  )
  assert.throws(
    () => mergeTranslationCatalogs('{"a":"Old"}', '{}', '{"a":"Changed"}'),
    /Conflicting/
  )
  assert.throws(() => mergeTranslationCatalogs('{}', '{"a":"One","a":"Two"}', '{}'), /Duplicate/)
  assert.throws(() => mergeTranslationCatalogs('{}', '{"a":true}', '{}'), /string leaves/)
})

test('real Git: reuses only a reviewed three-blob resolution and refuses changed inputs', () =>
  fixture((cwd) => {
    const upstream = git(cwd, 'rev-parse', 'HEAD')
    const heads = []
    for (const text of ['one', 'two']) {
      git(cwd, 'checkout', '-B', text, upstream)
      writeFileSync(join(cwd, 'file'), `${text}\n`)
      git(cwd, 'add', 'file')
      git(cwd, 'commit', '-m', text)
      heads.push(git(cwd, 'rev-parse', 'HEAD'))
    }
    git(cwd, 'checkout', '--detach', heads[0])
    assert.throws(() => git(cwd, 'merge', '--no-commit', heads[1]))
    const blobs = git(cwd, 'ls-files', '-u', '--', 'file')
      .split('\n')
      .map((line) => line.split(' ')[1])
    git(cwd, 'reset', '--hard', heads[0])
    const directory = join(cwd, '.git', 'reviewed-patches')
    mkdirSync(directory)
    const patch = '--- a/file\n+++ b/file\n@@ -1 +1 @@\n-one\n+both\n'
    const hash = (text) => createHash('sha256').update(text).digest('hex')
    const name = `${hash(patch)}.patch`
    writeFileSync(join(directory, name), patch)
    writeFileSync(
      join(directory, 'manifest.json'),
      JSON.stringify([
        {
          path: 'file',
          blobs,
          patch: name,
          patchSha256: hash(patch),
          resultSha256: hash('both\n'),
          reason: 'Reviewed union'
        }
      ])
    )
    const selection = (values) => values.map((sha, index) => ({ ...pr(index + 1), head: { sha } }))
    const result = compose(cwd, upstream, selection(heads), { resolutionsDirectory: directory })
    assert.equal(result.publishable, true)
    assert.equal(git(cwd, 'show', 'HEAD:file'), 'both')
    assert.equal(result.reviewedResolutions[0].patches[0].patchSha256, hash(patch))
    git(cwd, 'checkout', '-B', 'changed', heads[0])
    writeFileSync(join(cwd, 'file'), 'changed\n')
    git(cwd, 'add', 'file')
    git(cwd, 'commit', '-m', 'changed input')
    const changed = git(cwd, 'rev-parse', 'HEAD')
    const refused = compose(cwd, upstream, selection([changed, heads[1]]), {
      resolutionsDirectory: directory
    })
    assert.equal(refused.publishable, false)
    assert.equal(git(cwd, 'show', 'HEAD:file'), 'changed')
  }))

test('real Git: a text-clean merge with duplicate catalog keys cannot become a build candidate', () =>
  fixture((cwd) => {
    const path = 'mobile/src/i18n/locales/en.json'
    mkdirSync(join(cwd, 'mobile/src/i18n/locales'), { recursive: true })
    const base = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`key${i}`, `Value ${i}`]))
    writeFileSync(join(cwd, path), `${JSON.stringify(base, null, 2)}\n`)
    git(cwd, 'add', path)
    git(cwd, 'commit', '-m', 'valid catalog')
    const upstream = git(cwd, 'rev-parse', 'HEAD')
    const heads = []
    for (const [name, after] of [
      ['One', 'key1'],
      ['Two', 'key18']
    ]) {
      git(cwd, 'checkout', '-B', name, upstream)
      const rows = []
      for (const row of Object.entries(base)) {
        rows.push(row)
        if (row[0] === after) {
          rows.push(['duplicate', name])
        }
      }
      writeFileSync(join(cwd, path), `${JSON.stringify(Object.fromEntries(rows), null, 2)}\n`)
      git(cwd, 'add', path)
      git(cwd, 'commit', '-m', name)
      heads.push(git(cwd, 'rev-parse', 'HEAD'))
    }
    assert.throws(
      () =>
        compose(
          cwd,
          upstream,
          heads.map((sha, index) => ({
            ...pr(index + 1),
            head: { sha }
          }))
        ),
      /Duplicate translation key/
    )
    assert.equal(JSON.parse(git(cwd, 'show', `HEAD:${path}`)).duplicate, 'One')
  }))
