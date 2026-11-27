import assert from 'node:assert/strict'
import { test } from 'node:test'
import { retainCurrentRelease } from './release-retention.mjs'
import { packageTargets, personalPackageOutputs } from './package-targets.mjs'

function scenario() {
  const plan = {
    configuration: 'a'.repeat(40),
    releaseTag: 'personal-20-1',
    previous: {
      lastGood: { tag: 'personal-10-1', promoted: true, commit: 'd'.repeat(40) }
    },
    fingerprint: 'c'.repeat(64),
    result: { publishable: true, commit: 'b'.repeat(40) }
  }
  const ledger = {
    lastGood: {
      tag: 'personal-20-1',
      promoted: true,
      fingerprint: plan.fingerprint,
      commit: plan.result.commit
    }
  }
  const release = (id, tag, date, draft = false) => ({
    id,
    tag_name: tag,
    target_commitish: tag === plan.releaseTag ? plan.result.commit : 'd'.repeat(40),
    prerelease: true,
    assets: [
      'release-verification.json',
      'SHA256SUMS',
      'source.bundle',
      'orca-macos-arm64.dmg',
      'Orca-1.0.0-arm64-mac.zip',
      ...packageTargets(personalPackageOutputs).flatMap((target) => target.files ?? [])
    ].map((name) => ({
      name,
      size: 512,
      state: 'uploaded',
      digest: `sha256:${'a'.repeat(64)}`
    })),
    published_at: date,
    draft
  })
  const releases = [
    release(20, 'personal-20-1', '2026-11-10T00:00:00Z'),
    release(10, 'personal-10-1', '2026-11-09T00:00:00Z'),
    release(5, 'personal-5-1', '2026-11-08T00:00:00Z'),
    release(6, 'personal-6-1', '2026-11-08T00:00:00Z'),
    release(7, 'old-evidence', '2026-11-08T00:00:00Z'),
    release(21, 'personal-21-1', null, true),
    { ...release(8, 'personal-8-1', '2026-11-08T00:00:00Z'), prerelease: false }
  ]
  const removed = []
  const records = []
  const input = {
    plan,
    apply: true,
    environment: {
      GITHUB_REPOSITORY: 'gentslava/orca',
      GITHUB_REF: 'refs/heads/master',
      GITHUB_SHA: plan.configuration,
      GITHUB_RUN_ID: '20',
      GITHUB_RUN_ATTEMPT: '1',
      PUBLICATION: 'success',
      BRANCH_SYNC: 'success'
    },
    read: (path) => {
      if (path.includes('/issues/')) {
        return { body: `<!-- orca-personal-ledger\n${JSON.stringify(ledger)}\n-->` }
      }
      if (path.includes('?')) {
        const page = Number(new URLSearchParams(path.split('?')[1]).get('page'))
        return releases.slice((page - 1) * 100, page * 100)
      }
      return releases.find((entry) => entry.id === Number(path.split('/').at(-1)))
    },
    remove: (path) => removed.push(Number(path.split('/').at(-1))),
    record: (receipt) => records.push(structuredClone(receipt))
  }
  return { input, ledger, releases, release, removed, records }
}

test('keeps both promoted releases and removes older personal prereleases only', () => {
  const { input, removed, records } = scenario()
  const candidates = [
    { id: 5, tag: 'personal-5-1' },
    { id: 6, tag: 'personal-6-1' }
  ]
  assert.deepEqual(retainCurrentRelease(input), {
    kept: [
      { id: 20, tag: 'personal-20-1' },
      { id: 10, tag: 'personal-10-1' }
    ],
    candidates,
    deleted: candidates,
    deleteGitTags: false,
    preview: false
  })
  assert.deepEqual(removed, [5, 6])
  assert.equal(records.length, 3)
})

test('previews without deleting and accepts a plan reused on a workflow retry', () => {
  const { input, removed } = scenario()
  input.apply = false
  input.environment.GITHUB_RUN_ATTEMPT = '2'
  const receipt = retainCurrentRelease(input)
  assert.equal(receipt.preview, true)
  assert.deepEqual(
    receipt.candidates.map(({ id }) => id),
    [5, 6]
  )
  assert.deepEqual(removed, [])
})

test('preserves every older release when there is no recorded rollback', () => {
  const { input, removed } = scenario()
  delete input.plan.previous
  assert.deepEqual(retainCurrentRelease(input).kept, [{ id: 20, tag: 'personal-20-1' }])
  assert.deepEqual(removed, [])
})

test('failed, unpromoted, audit, reused and foreign runs never read or delete releases', () => {
  for (const change of [
    (s) => {
      s.environment.PUBLICATION = 'failure'
    },
    (s) => {
      s.environment.BRANCH_SYNC = 'failure'
    },
    (s) => {
      s.environment.GITHUB_REPOSITORY = 'stablyai/orca'
    },
    (s) => {
      s.environment.GITHUB_REF = 'refs/pull/1/merge'
    },
    (s) => {
      s.plan.auditOnly = true
    },
    (s) => {
      s.plan.reuse = true
    },
    (s) => {
      s.plan.result.publishable = false
    }
  ]) {
    const { input } = scenario()
    change(input)
    input.read = input.remove = () => assert.fail('must not access releases')
    assert.equal(retainCurrentRelease(input).skipped, true)
  }
})

test('stale ledgers and newer releases abort before any deletion', () => {
  for (const kind of ['live', 'newer', 'source', 'rollback', 'assets', 'configuration']) {
    const { input, releases, release, removed } = scenario()
    if (kind === 'live') {
      const read = input.read
      input.read = (path) => (path.includes('/issues/') ? { body: '' } : read(path))
    }
    if (kind === 'newer') {
      releases.push(release(22, 'personal-22-1', '2026-11-11T00:00:00Z'))
    }
    if (kind === 'source') {
      releases[0].target_commitish = input.plan.configuration
    }
    if (kind === 'rollback') {
      releases[1].target_commitish = input.plan.configuration
    }
    if (kind === 'assets') {
      releases[1].assets = releases[1].assets.filter(({ name }) => name !== 'orca-android.apk')
    }
    if (kind === 'configuration') {
      input.environment.GITHUB_SHA = 'b'.repeat(40)
    }
    assert.throws(() => retainCurrentRelease(input))
    assert.deepEqual(removed, [])
  }
})

test('paginates all releases and stops on the first failed deletion with a partial receipt', () => {
  const { input, releases, release, removed, records } = scenario()
  for (let id = 30; id < 135; id++) {
    releases.push(release(id, `personal-${id}-1`, '2026-11-01T00:00:00Z'))
  }
  const remove = input.remove
  input.remove = (path) => {
    if (removed.length === 100) {
      throw new Error('GitHub unavailable')
    }
    remove(path)
  }
  assert.throws(() => retainCurrentRelease(input), /GitHub unavailable/)
  assert.equal(removed.length, 100)
  assert.equal(records.at(-1).deleted.length, 100)
})

test('a concurrent ledger change stops cleanup before the next deletion', () => {
  const { input, removed, ledger } = scenario()
  const remove = input.remove
  input.remove = (path) => {
    remove(path)
    ledger.lastGood.tag = 'personal-21-1'
  }
  assert.throws(() => retainCurrentRelease(input), /Last successful release changed/)
  assert.deepEqual(removed, [5])
})
