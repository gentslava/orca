import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { compose, git } from './composition.mjs'
import { readPullRequest } from './github.mjs'
import { resolveSelection } from './selection.mjs'

test('a reviewed replacement survives a missing PR record only with verified merge ancestry', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'personal-reviewed-merge-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  git(cwd, ['init', '-b', 'main'])
  git(cwd, ['config', 'user.name', 'Fork build fixture'])
  git(cwd, ['config', 'user.email', 'fork-build@example.invalid'])
  git(cwd, ['commit', '--allow-empty', '-m', 'Base'])
  const base = git(cwd, ['rev-parse', 'HEAD'])
  writeFileSync(join(cwd, 'shared-reader'), 'direct owner import\n')
  git(cwd, ['add', 'shared-reader'])
  git(cwd, ['commit', '-m', 'Upstream reader optimization'])
  const merged = git(cwd, ['rev-parse', 'HEAD'])
  const noMetadata = () => {
    throw Object.assign(new Error('GitHub returned 404'), { stderr: 'gh: Not Found (HTTP 404)\n' })
  }
  const selection = {
    base: 'main',
    authors: ['owner'],
    seed: [1],
    exclude: {},
    dependencies: {},
    include: [{ number: 4, reason: 'required feature' }],
    replacements: { 1: 2 },
    reviewedUpstreamMerges: {
      2: {
        head: merged,
        merge: merged,
        mergedAt: '2026-11-08T04:44:39Z',
        reason: 'Previous release verified the upstream merge and the equivalent patch'
      }
    }
  }
  const resolved = await resolveSelection(selection, {
    openOwn: [],
    readPr: async (n) =>
      n === 1
        ? { number: 1, state: 'closed', base: { ref: 'main' } }
        : readPullRequest(String(n), noMetadata)
  })
  assert.deepEqual(
    resolved.selections.map(({ number }) => number),
    [2]
  )
  assert.deepEqual(resolved.blockers, [
    { number: 4, reason: 'GitHub PR metadata unavailable (HTTP 404)' }
  ])
  const result = compose(cwd, merged, resolved.selections)
  assert.deepEqual(result.suppliedByUpstream, [2])
  assert.deepEqual(result.included, [])
  const unproven = compose(cwd, base, resolved.selections)
  assert.equal(unproven.publishable, false)
  assert.deepEqual(unproven.suppliedByUpstream, [])
})
