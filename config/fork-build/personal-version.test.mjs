import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { upstreamReleaseIdentity } from './upstream-release-identity.mjs'
import { createLocalBuildVersion } from '../scripts/desktop-distribution/macos/build-mac-local.mjs'

// Promotion replaces this checkout with the composed source, where upstream moved the module.
const appVersionModule = [
  '../../src/shared/app-lifecycle/identity/app-version.ts',
  '../../src/shared/app-version.ts'
].find((path) => existsSync(new URL(path, import.meta.url)))
const { compareAppVersions } = await import(appVersionModule)

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
