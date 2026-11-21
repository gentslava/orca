import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveSelection } from './selection.mjs'
import { compose, freezeForkFeatureHead } from './composition.mjs'
import { renderReport } from './github.mjs'

const rows = {
  ref: 'refs/heads/fix/project-only-rows',
  reason: 'Owner keeps project-only Activity rows; upstream keeps workspace names'
}
const header = {
  ref: 'refs/heads/fix/compact-header',
  reason: 'Owner header layout',
  repository: 'owner/other'
}
const config = {
  base: 'main',
  authors: ['owner'],
  seed: [],
  include: [],
  exclude: {},
  replacements: {},
  dependencies: {},
  forkFeatures: { 'project-only-rows': rows, 'compact-header': header }
}
const heads = { [rows.ref]: 'a'.repeat(40), [header.ref]: 'b'.repeat(40) }
const branch = (repository, ref, sha = heads[ref], type = 'commit') => ({
  repository,
  ref,
  object: { type, sha }
})
const readers = {
  openOwn: [],
  forkRepository: 'owner/fork',
  readPr: async () => {
    throw new Error('must not read PRs')
  },
  readForkBranch: async ({ repository, ref }) => branch(repository, ref)
}

test('pins every fork-local branch head in slug order with its repository, ref and reason', async () => {
  const requested = []
  const result = await resolveSelection(config, {
    ...readers,
    readForkBranch: async (source) => {
      requested.push(source)
      return branch(source.repository, source.ref)
    }
  })
  assert.deepEqual(result.forkFeatures, [
    {
      feature: 'compact-header',
      repository: 'owner/other',
      ref: header.ref,
      reason: header.reason,
      head: { sha: 'b'.repeat(40) }
    },
    {
      feature: 'project-only-rows',
      repository: 'owner/fork',
      ref: rows.ref,
      reason: rows.reason,
      head: { sha: 'a'.repeat(40) }
    }
  ])
  assert.deepEqual(requested, [
    { repository: 'owner/other', ref: header.ref },
    { repository: 'owner/fork', ref: rows.ref }
  ])
  assert.deepEqual(result.selections, [])
  assert.deepEqual(result.tracked, [])
  assert.deepEqual(
    (await resolveSelection({ ...config, forkFeatures: undefined }, readers)).forkFeatures,
    []
  )
})

test('rejects an invalid fork feature declaration before reading any branch', async () => {
  const unread = {
    ...readers,
    readForkBranch: async () => {
      throw new Error('must not read branches')
    }
  }
  for (const forkFeatures of [
    { valid: { ref: rows.ref } },
    { valid: { ...rows, reason: ' ' } },
    { valid: { ...rows, ref: 'refs/tags/project-only-rows' } },
    { valid: { ...rows, ref: 'fix/project-only-rows' } },
    { valid: { ...rows, ref: 'refs/heads/a:refs/heads/b' } },
    { valid: { ...rows, repository: 'stranger/fork' } },
    { valid: { ...rows, repository: 'not a repository' } },
    { valid: { ...rows, branch: 'typo' } },
    { Upper: rows },
    { 'trailing-': rows },
    { 'a/b': rows },
    { one: rows, two: rows },
    [rows]
  ]) {
    await assert.rejects(
      resolveSelection({ ...config, forkFeatures }, unread),
      /Invalid fork feature/
    )
  }
  await assert.rejects(
    resolveSelection(config, { ...unread, forkRepository: undefined }),
    /Invalid fork feature/
  )
  await assert.rejects(
    resolveSelection(
      {
        ...config,
        retainClosed: { 7: 'Kept' },
        retainedHeadSources: { 7: { repository: 'owner/fork', ref: rows.ref } }
      },
      unread
    ),
    /Invalid fork feature/
  )
})

test('a missing, renamed, mismatched or malformed branch never yields a pin', async () => {
  const reading = (reply) => resolveSelection(config, { ...readers, readForkBranch: reply })
  await assert.rejects(
    reading(async () => {
      throw new Error('branch missing')
    }),
    /branch missing/
  )
  for (const reply of [
    async ({ ref }) => branch('owner/renamed', ref),
    async ({ repository }) => branch(repository, 'refs/heads/fix/project-only-rows-old'),
    async ({ repository, ref }) => branch(repository, ref, heads[ref], 'tag'),
    async ({ repository, ref }) => branch(repository, ref, 'bad')
  ]) {
    await assert.rejects(reading(reply), /identity/)
  }
  await assert.rejects(
    resolveSelection(config, { ...readers, readForkBranch: undefined }),
    /identity/
  )
})

test('fork reports name fork features plainly with source, reason and composition state', async () => {
  const { forkFeatures } = await resolveSelection(
    {
      ...config,
      forkFeatures: {
        ...config.forkFeatures,
        'already-upstream': { ...rows, ref: 'refs/heads/done' }
      }
    },
    {
      ...readers,
      readForkBranch: async ({ repository, ref }) => branch(repository, ref, 'c'.repeat(40))
    }
  )
  const report = renderReport({
    selections: [],
    forkFeatures,
    blockers: [],
    lifecycle: [],
    result: {
      publishable: false,
      included: [{ feature: 'compact-header', head: 'c'.repeat(40) }],
      satisfiedFeatures: ['already-upstream'],
      reviewedResolutions: [
        {
          feature: 'compact-header',
          patches: [{ path: 'header.tsx', patchSha256: 'd'.repeat(64), reason: 'Keep both rows' }]
        }
      ],
      conflicts: [
        {
          feature: 'project-only-rows',
          head: 'c'.repeat(40),
          kind: 'combination',
          paths: ['rows.tsx'],
          preceding: [33361],
          precedingFeatures: ['compact-header']
        }
      ],
      blockers: [],
      suppliedByUpstream: []
    }
  })
  assert.match(report, /## Fork-local features/)
  assert.match(
    report,
    /- compact-header: composed from `owner\/other:refs\/heads\/fix\/compact-header` at `c{40}`\. Owner header layout/
  )
  assert.match(report, /- already-upstream: already contained in upstream; skipped/)
  assert.match(report, /- project-only-rows: not composed/)
  assert.match(report, /- Feature compact-header: `header\.tsx`; patch SHA-256/)
  assert.match(
    report,
    /- Feature project-only-rows: \*\*combination\*\* conflict; `rows\.tsx`\. Prior integrated PRs: 33361\. Prior integrated features: compact-header\./
  )
  assert.doesNotMatch(report, /#\d|github\.com\/stablyai\/orca/)
})

const pr = (number, sha) => ({
  number,
  state: 'open',
  user: { login: 'owner' },
  base: { ref: 'main' },
  head: { sha }
})
function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}
function fixture(run) {
  const cwd = mkdtempSync(join(tmpdir(), 'personal-fork-feature-test-'))
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
const feature = (name, sha) => ({
  feature: name,
  repository: 'owner/fork',
  ref: `refs/heads/${name}`,
  reason: 'Owner preference',
  head: { sha }
})

test('real Git: fork features compose after PRs as linear integrations; a contained head is skipped', () =>
  fixture((cwd) => {
    const contained = git(cwd, 'rev-parse', 'HEAD')
    writeFileSync(join(cwd, 'upstream'), 'upstream\n')
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'upstream')
    const upstream = git(cwd, 'rev-parse', 'HEAD')
    function branch(name, path) {
      git(cwd, 'checkout', '-B', name, upstream)
      writeFileSync(join(cwd, path), `${name}\n`)
      git(cwd, 'add', '.')
      git(cwd, 'commit', '-m', name)
      return git(cwd, 'rev-parse', 'HEAD')
    }
    const one = branch('one', 'file')
    const rows = branch('rows', 'rows')
    const result = compose(
      cwd,
      upstream,
      [pr(1, one), feature('rows', rows), feature('landed', contained)],
      { timestamp: '2026-11-21T00:00:00Z' }
    )
    assert.equal(result.publishable, true)
    assert.deepEqual(result.included, [
      { number: 1, head: one },
      { feature: 'rows', head: rows }
    ])
    assert.deepEqual(result.satisfiedFeatures, ['landed'])
    assert.equal(git(cwd, 'show', `${result.commit}:rows`), 'rows')
    assert.equal(git(cwd, 'show', `${result.commit}:file`), 'one')
    assert.equal(
      git(cwd, 'log', '--format=%s', `${upstream}..${result.commit}`),
      'fork: integrate feature rows\nfork: integrate PR 1'
    )
    assert.match(
      git(cwd, 'show', '--no-patch', '--format=%B', result.commit),
      new RegExp(`Source-Head: ${rows}`)
    )
    assert.equal(
      git(cwd, 'rev-list', '--count', `${upstream}..${result.commit}`),
      `${result.included.length}`
    )
    assert.equal(git(cwd, 'rev-list', '--min-parents=2', `${upstream}..${result.commit}`), '')
  }))

test('real Git: a fork feature carrying upstream history newer than the frozen upstream blocks publication', () =>
  fixture((cwd) => {
    const pinned = git(cwd, 'rev-parse', 'HEAD')
    writeFileSync(join(cwd, 'newer'), 'newer upstream\n')
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'newer upstream')
    const observed = git(cwd, 'rev-parse', 'HEAD')
    git(cwd, 'checkout', '-B', 'rows', pinned)
    writeFileSync(join(cwd, 'rows'), 'rows\n')
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'rows')
    const onPin = git(cwd, 'rev-parse', 'HEAD')
    const applied = compose(cwd, pinned, [feature('rows', onPin)], { observedUpstream: observed })
    assert.equal(applied.publishable, true)
    git(cwd, 'checkout', 'rows')
    git(cwd, 'merge', '--no-edit', observed)
    const ahead = git(cwd, 'rev-parse', 'HEAD')
    const blocked = compose(cwd, pinned, [feature('rows', ahead)], { observedUpstream: observed })
    assert.equal(blocked.publishable, false)
    assert.deepEqual(blocked.included, [])
    assert.equal(blocked.blockers[0].feature, 'rows')
    assert.match(blocked.blockers[0].reason, /newer than the frozen upstream/)
    assert.throws(() => git(cwd, 'show', `${blocked.commit}:newer`))
  }))

test('real Git: fork feature conflicts use reviewed three-blob records keyed by feature', () =>
  fixture((cwd) => {
    const upstream = git(cwd, 'rev-parse', 'HEAD')
    const heads = []
    for (const text of ['one', 'rows']) {
      git(cwd, 'checkout', '-B', text, upstream)
      writeFileSync(join(cwd, 'file'), `${text}\n`)
      git(cwd, 'add', 'file')
      git(cwd, 'commit', '-m', text)
      heads.push(git(cwd, 'rev-parse', 'HEAD'))
    }
    const selection = [pr(1, heads[0]), feature('rows', heads[1])]
    const conflicted = compose(cwd, upstream, selection)
    assert.equal(conflicted.publishable, false)
    assert.deepEqual(
      conflicted.conflicts.map(({ feature, kind, preceding, precedingFeatures }) => ({
        feature,
        kind,
        preceding,
        precedingFeatures
      })),
      [{ feature: 'rows', kind: 'combination', preceding: [1], precedingFeatures: [] }]
    )
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
    writeFileSync(join(directory, 'refresh-test-rows-0.patch'), patch)
    writeFileSync(
      join(directory, 'manifest.json'),
      JSON.stringify([
        {
          path: 'file',
          blobs,
          patch: 'refresh-test-rows-0.patch',
          patchSha256: hash(patch),
          resultSha256: hash('both\n'),
          reason: 'Keep both rows'
        }
      ])
    )
    const result = compose(cwd, upstream, selection, { resolutionsDirectory: directory })
    assert.equal(result.publishable, true)
    assert.equal(git(cwd, 'show', 'HEAD:file'), 'both')
    assert.deepEqual(result.reviewedResolutions, [
      {
        feature: 'rows',
        patches: [{ path: 'file', patchSha256: hash(patch), reason: 'Keep both rows' }]
      }
    ])
    assert.equal(
      git(cwd, 'show', '--no-patch', '--format=%s', 'HEAD'),
      'fork: integrate feature rows'
    )
  }))

test('real Git: fork feature branches freeze the pinned head and reject races, rewrites and missing refs', () =>
  fixture((cwd) => {
    writeFileSync(join(cwd, 'file'), 'rows\n')
    git(cwd, 'commit', '-am', 'rows')
    const head = git(cwd, 'rev-parse', 'HEAD')
    git(cwd, 'branch', 'rows', head)
    const selected = feature('rows', head)
    const transport = (directory, args) =>
      git(
        directory,
        ...args.map((arg) => (arg === 'https://github.com/owner/fork.git' ? cwd : arg))
      )
    freezeForkFeatureHead(cwd, selected, transport)
    assert.equal(git(cwd, 'rev-parse', 'refs/personal/feature-rows'), head)

    git(cwd, 'update-ref', '-d', 'refs/personal/feature-rows')
    writeFileSync(join(cwd, 'file'), 'concurrent branch update\n')
    git(cwd, 'commit', '-am', 'concurrent branch update')
    git(cwd, 'update-ref', 'refs/heads/rows', git(cwd, 'rev-parse', 'HEAD'))
    assert.throws(() => freezeForkFeatureHead(cwd, selected, transport), /moved after snapshot/)

    git(cwd, 'update-ref', '-d', 'refs/personal/feature-rows')
    git(
      cwd,
      'update-ref',
      'refs/heads/rows',
      git(cwd, 'commit-tree', `${head}^{tree}`, '-m', 'rewritten')
    )
    assert.throws(() => freezeForkFeatureHead(cwd, selected, transport), /moved after snapshot/)

    git(cwd, 'update-ref', '-d', 'refs/personal/feature-rows')
    assert.throws(() =>
      freezeForkFeatureHead(cwd, { ...selected, ref: 'refs/heads/missing' }, transport)
    )
    assert.throws(() => git(cwd, 'rev-parse', '--verify', '--quiet', 'refs/personal/feature-rows'))
  }))
