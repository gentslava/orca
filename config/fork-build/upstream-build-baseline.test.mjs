import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from './composition.mjs'
import {
  selectUpstreamBuildCommit,
  requireUpstreamBuildAncestor
} from './upstream-build-baseline.mjs'

test('normal builds follow the observed main; explicit builds require a complete immutable identity', () => {
  const main = 'a'.repeat(40)
  assert.equal(selectUpstreamBuildCommit(main, ''), main)
  assert.equal(selectUpstreamBuildCommit(main, ` ${'b'.repeat(40)} `), 'b'.repeat(40))
  assert.throws(() => selectUpstreamBuildCommit(main, 'main'))
  assert.throws(() => selectUpstreamBuildCommit(main, '--upload-pack=other'))
})

test('a pinned upstream build accepts ancestors and refuses unrelated Git histories', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'orca-build-baseline-'))
  try {
    git(cwd, ['init', '-q'])
    git(cwd, ['config', 'user.name', 'Baseline test'])
    git(cwd, ['config', 'user.email', 'baseline@example.invalid'])
    git(cwd, ['commit', '--allow-empty', '-qm', 'old'])
    const old = git(cwd, ['rev-parse', 'HEAD'])
    git(cwd, ['commit', '--allow-empty', '-qm', 'main'])
    const main = git(cwd, ['rev-parse', 'HEAD'])
    requireUpstreamBuildAncestor(cwd, old, main)
    requireUpstreamBuildAncestor(cwd, main, main)
    const foreign = git(cwd, [
      'commit-tree',
      git(cwd, ['rev-parse', 'HEAD^{tree}']),
      '-m',
      'foreign'
    ])
    assert.throws(() => requireUpstreamBuildAncestor(cwd, foreign, main))
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
