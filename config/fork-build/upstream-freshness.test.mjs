import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from './composition.mjs'
import { requireUpstreamBuildAncestor } from './upstream-build-baseline.mjs'
import { requireCurrentUpstream } from './upstream-freshness.mjs'

const head = 'a'.repeat(40)
const plan = { repository: 'stablyai/orca', upstream: head }

test('allows publication while upstream main still matches the built source', () => {
  assert.equal(
    requireCurrentUpstream(plan, () => `${head}\trefs/heads/main\n`),
    head
  )
})

test('refuses an upstream update that arrives while the platforms are building', () => {
  assert.throws(
    () => requireCurrentUpstream(plan, () => `${'b'.repeat(40)}\trefs/heads/main`),
    /Upstream main moved.*rerun composition and checks/
  )
})

test('rejects an invalid source identity before reading remote state', () => {
  assert.throws(
    () =>
      requireCurrentUpstream({ ...plan, repository: 'other/repo' }, () => {
        assert.fail('An invalid plan must not reach the network')
      }),
    /Invalid upstream identity/
  )
})

test('does not accept an ambiguous remote reply as a freshness proof', () => {
  assert.throws(
    () => requireCurrentUpstream(plan, () => `${head}\trefs/heads/main\n${head}\trefs/heads/other`),
    /Could not verify/
  )
})

test('explicit snapshots follow a real uninterrupted upstream history through publication', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'orca-publish-snapshot-'))
  try {
    git(cwd, ['init', '-q'])
    git(cwd, ['config', 'user.name', 'Snapshot test'])
    git(cwd, ['config', 'user.email', 'snapshot@example.invalid'])
    git(cwd, ['commit', '--allow-empty', '-qm', 'selected'])
    const selected = git(cwd, ['rev-parse', 'HEAD'])
    git(cwd, ['commit', '--allow-empty', '-qm', 'observed'])
    const observed = git(cwd, ['rev-parse', 'HEAD'])
    git(cwd, ['commit', '--allow-empty', '-qm', 'current'])
    const current = git(cwd, ['rev-parse', 'HEAD'])
    const verify = (a, b, c) => {
      requireUpstreamBuildAncestor(cwd, a, b)
      requireUpstreamBuildAncestor(cwd, b, c)
    }
    const reply = () => `${current}\trefs/heads/main`
    const snapshot = {
      repository: 'stablyai/orca',
      upstream: selected,
      upstreamBaseline: { observed, pinned: true }
    }
    assert.equal(requireCurrentUpstream(snapshot, reply, verify), current)
    assert.equal(
      requireCurrentUpstream(
        { ...snapshot, upstreamBaseline: { observed: selected, requested: true } },
        reply,
        verify
      ),
      current
    )
    assert.throws(
      () =>
        requireCurrentUpstream(
          { ...snapshot, upstreamBaseline: { observed, pinned: false } },
          reply,
          verify
        ),
      /Upstream main moved/
    )
    const foreign = git(cwd, [
      'commit-tree',
      git(cwd, ['rev-parse', 'HEAD^{tree}']),
      '-m',
      'foreign'
    ])
    assert.throws(
      () => requireCurrentUpstream({ ...snapshot, upstream: foreign }, reply, verify),
      /not in the observed upstream history/
    )
    assert.throws(
      () => requireCurrentUpstream(snapshot, () => `${foreign}\trefs/heads/main`, verify),
      /not in the observed upstream history/
    )
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('a snapshot without a verifiable observed identity cannot relax freshness', () => {
  assert.throws(
    () =>
      requireCurrentUpstream(
        { ...plan, upstreamBaseline: { pinned: true } },
        () => `${'b'.repeat(40)}\trefs/heads/main`,
        () => assert.fail('Invalid snapshot must not reach ancestry verification')
      ),
    /Invalid observed upstream identity/
  )
})
