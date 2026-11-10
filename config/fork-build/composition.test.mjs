import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveSelection, orderSelections } from './selection.mjs'
import { compose, assertFrozenHead, freezeRetainedHead } from './composition.mjs'
import { mergeTranslationCatalogs, parseCatalog } from './locale-merge.mjs'
import { renderReport } from './github.mjs'
import { pruneTranslationsWithoutSource } from './fork-localizations.mjs'
import { upstreamReleaseIdentity } from './upstream-release-identity.mjs'
import { createLocalBuildVersion } from '../scripts/desktop-distribution/macos/build-mac-local.mjs'
import { compareAppVersions } from '../../src/shared/app-version.ts'

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
  const cwd = mkdtempSync(join(tmpdir(), 'personal-build-test-'))
  try {
    git(cwd, 'init', '-b', 'main')
    git(cwd, 'config', 'user.name', 'Fork build fixture')
    git(cwd, 'config', 'user.email', 'fork-build@example.invalid')
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
    assert.equal(
      git(cwd, 'show', '--no-patch', '--format=%an <%ae>%n%cn <%ce>%n%s', result.commit),
      'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>\ngithub-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>\nfork: integrate PR 1'
    )
    assert.equal(
      git(cwd, 'show', '--no-patch', '--format=%an <%ae>', one),
      'Fork build fixture <fork-build@example.invalid>'
    )
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
    assert.equal(
      git(cwd, 'show', '--no-patch', '--format=%ae%n%ce', result.commit),
      '41898282+github-actions[bot]@users.noreply.github.com\n41898282+github-actions[bot]@users.noreply.github.com'
    )
    assert.equal(
      git(cwd, 'show', '--no-patch', '--format=%s', result.commit),
      'fork: integrate PR 2'
    )
    assert.deepEqual(
      result.conflicts.map((entry) => [entry.number, entry.kind]),
      [[3, 'combination']]
    )
    assert.equal(result.publishable, false)
    const report = renderReport({
      repository: 'stablyai/orca',
      selections: [one, two, conflict].map((sha, index) => ({
        ...pr(index + 1),
        head: { sha }
      })),
      result,
      blockers: [{ number: 4, reason: 'Required change unavailable' }],
      lifecycle: [{ number: 5, disposition: 'replaced', replacement: 6 }]
    })
    assert.match(report, /\| PR 2 \| open \|/)
    assert.match(report, /PR 2: independent keys merged/)
    assert.match(report, /PR 3: \*\*combination\*\* conflict/)
    assert.match(report, /PR 5: replaced → PR 6/)
    assert.doesNotMatch(report, /#\d|github\.com\/stablyai\/orca/)
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

test('real Git: repairs text-clean duplicate scopes from valid independent catalog additions', () =>
  fixture((cwd) => {
    const path = 'src/renderer/src/i18n/locales/en.json'
    mkdirSync(join(cwd, 'src/renderer/src/i18n/locales'), { recursive: true })
    const base = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`key${i}`, `Value ${i}`]))
    writeFileSync(join(cwd, path), `${JSON.stringify(base, null, 2)}\n`)
    git(cwd, 'add', path)
    git(cwd, 'commit', '-m', 'valid catalog')
    const upstream = git(cwd, 'rev-parse', 'HEAD')
    const heads = []
    for (const [name, after, values] of [
      ['one', 'key1', { pin: 'Pin', saveFailed: 'Could not save' }],
      ['two', 'key18', { saveFailed: 'Could not save' }]
    ]) {
      git(cwd, 'checkout', '-B', name, upstream)
      const rows = Object.entries(base).flatMap((row) =>
        row[0] === after ? [row, ['projectOrder', values]] : [row]
      )
      writeFileSync(join(cwd, path), `${JSON.stringify(Object.fromEntries(rows), null, 2)}\n`)
      git(cwd, 'add', path)
      git(cwd, 'commit', '-m', name)
      heads.push(git(cwd, 'rev-parse', 'HEAD'))
    }
    git(cwd, 'merge', '--no-commit', '--no-ff', heads[0])
    assert.equal(git(cwd, 'diff', '--name-only', '--diff-filter=U'), '')
    assert.throws(() => parseCatalog(git(cwd, 'show', `:${path}`)), /Duplicate/)
    git(cwd, 'merge', '--abort')
    const result = compose(
      cwd,
      upstream,
      heads.map((sha, i) => ({ ...pr(i + 1), head: { sha } }))
    )
    assert.equal(result.publishable, true)
    assert.deepEqual(parseCatalog(git(cwd, 'show', `HEAD:${path}`)), {
      ...base,
      projectOrder: { pin: 'Pin', saveFailed: 'Could not save' }
    })
    assert.deepEqual(result.localeMerges, [{ number: 2, paths: [path] }])
  }))

test('real Git: shared integration ancestry cannot undo another selected feature', () =>
  fixture((cwd) => {
    const base = git(cwd, 'rev-parse', 'HEAD')
    writeFileSync(join(cwd, 'file'), 'one\n')
    writeFileSync(join(cwd, 'other'), 'two\n')
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'old combined fork')
    const shared = git(cwd, 'rev-parse', 'HEAD')
    git(cwd, 'checkout', '-B', 'upstream', base)
    writeFileSync(join(cwd, 'main-only'), 'upstream\n')
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'upstream')
    const upstream = git(cwd, 'rev-parse', 'HEAD')
    const heads = []
    for (const [name, path, text] of [
      ['one', 'file', 'one\n'],
      ['two', 'other', 'two\n']
    ]) {
      git(cwd, 'checkout', '-B', name, upstream)
      writeFileSync(join(cwd, path), text)
      git(cwd, 'add', '.')
      heads.push(
        git(cwd, 'commit-tree', git(cwd, 'write-tree'), '-p', upstream, '-p', shared, '-m', name)
      )
      git(cwd, 'reset', '--hard', upstream)
    }
    assert.equal(git(cwd, 'merge-base', '--all', ...heads).split('\n').length, 2)
    const result = compose(
      cwd,
      upstream,
      heads.map((sha, index) => ({ ...pr(index + 1), head: { sha } }))
    )
    assert.equal(result.publishable, true)
    assert.equal(git(cwd, 'show', 'HEAD:file'), 'one')
    assert.equal(git(cwd, 'show', 'HEAD:other'), 'two')
    assert.equal(git(cwd, 'show', 'HEAD:main-only'), 'upstream')
    for (const head of heads) {
      assert.throws(() => git(cwd, 'merge-base', '--is-ancestor', head, result.commit))
      assert.ok(git(cwd, 'log', '--format=%B', `${upstream}..HEAD`).includes(head))
    }
    const parents = git(cwd, 'show', '--format=%P', '--no-patch', result.commit).split(' ')
    assert.equal(parents.length, 1)
    assert.equal(git(cwd, 'rev-list', '--count', `${upstream}..HEAD`), '2')
    assert.equal(git(cwd, 'rev-list', '--min-parents=2', `${upstream}..HEAD`), '')
  }))

test('real Git: retained branches freeze the fork tip and reject races, rewritten ancestry and missing refs', () =>
  fixture((cwd) => {
    const closedHeadSha = git(cwd, 'rev-parse', 'HEAD')
    git(cwd, 'update-ref', 'refs/personal/closed-pr-7', closedHeadSha)
    writeFileSync(join(cwd, 'file'), 'retained update\n')
    git(cwd, 'commit', '-am', 'retained update')
    const head = git(cwd, 'rev-parse', 'HEAD')
    git(cwd, 'branch', 'retained', head)
    const selected = pr(7, {
      state: 'closed',
      head: { sha: head },
      retainedHeadSource: { repository: 'owner/fork', ref: 'refs/heads/retained', closedHeadSha }
    })
    const transport = (directory, args) =>
      git(
        directory,
        ...args.map((arg) => (arg === 'https://github.com/owner/fork.git' ? cwd : arg))
      )
    freezeRetainedHead(cwd, selected, transport)
    assert.equal(git(cwd, 'rev-parse', 'refs/personal/pr-7'), head)

    writeFileSync(join(cwd, 'file'), 'concurrent branch update\n')
    git(cwd, 'commit', '-am', 'concurrent branch update')
    git(cwd, 'update-ref', 'refs/heads/retained', git(cwd, 'rev-parse', 'HEAD'))
    assert.throws(() => freezeRetainedHead(cwd, selected, transport), /moved after snapshot/)

    git(cwd, 'update-ref', '-d', 'refs/personal/pr-7')
    const unrelated = git(cwd, 'commit-tree', 'HEAD^{tree}', '-m', 'unrelated root')
    git(cwd, 'update-ref', 'refs/heads/retained', unrelated)
    selected.head.sha = unrelated
    assert.throws(() => freezeRetainedHead(cwd, selected, transport), /does not descend/)
    selected.retainedHeadSource.ref = 'refs/heads/missing'
    assert.throws(() => freezeRetainedHead(cwd, selected, transport))
  }))

test('fork localization cleanup keeps Russian plural forms and removes only untranslated-source orphans', () => {
  const english = new Map([
    ['count_one', 'One'],
    ['count_other', 'Many'],
    ['section.keep', 'Keep']
  ])
  const original = {
    count_one: 'Один',
    count_few: 'Несколько',
    count_many: 'Много',
    count_other: 'Другие',
    section: { keep: 'Сохранить', stale: 'Удалено upstream' },
    removed: 'Старый ключ'
  }
  const pruned = pruneTranslationsWithoutSource(original, english, 'ru')
  assert.deepEqual(pruned.catalog, {
    count_one: 'Один',
    count_few: 'Несколько',
    count_many: 'Много',
    count_other: 'Другие',
    section: { keep: 'Сохранить' }
  })
  assert.deepEqual(pruned.removed, ['section.stale', 'removed'])
  assert.equal(original.section.stale, 'Удалено upstream')
  assert.equal(pruneTranslationsWithoutSource(original, english, 'en').catalog.count_few, undefined)
})

test('personal versions advance the released patch instead of the main package placeholder', () => {
  const release = {
    id: 254,
    tag_name: 'v1.4.254',
    draft: false,
    prerelease: false,
    published_at: '2026-11-08T23:25:31Z'
  }
  const identity = upstreamReleaseIdentity(release)
  assert.equal(identity.baseVersion, '1.4.255')
  const version = createLocalBuildVersion(identity.baseVersion, 123456, 'abcdef123456').replace(
    /([.-])local\.(?=\d+\.)/,
    '$1local.forkpreview.'
  )
  assert.equal(version, '1.4.255-local.forkpreview.123456.abcdef123456')
  assert.ok(compareAppVersions(version, '1.4.254') > 0)
  assert.equal(
    compareAppVersions('1.4.214-local.forkpreview.123456.abcdef123456', '1.4.254') < 0,
    true
  )
  for (const overrides of [
    { tag_name: 'v1.4.255-beta.1' },
    { tag_name: 'not-a-version' },
    { draft: true },
    { prerelease: true },
    { id: undefined },
    { published_at: null },
    { tag_name: 'v1.4.9007199254740991' }
  ]) {
    assert.throws(() => upstreamReleaseIdentity({ ...release, ...overrides }))
  }
})
