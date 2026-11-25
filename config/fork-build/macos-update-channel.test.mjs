import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { signedMacTeamId, writeForkMacUpdateManifest } from './macos-update-channel.mjs'

const tree = 'a'.repeat(40)
const macosTeamId = 'A0BC3D2E1F'
const signing = {
  GITHUB_REPOSITORY: 'gentslava/orca',
  GITHUB_REF: 'refs/heads/master',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  FORK_MAC_SIGN_TREE: tree,
  FORK_MAC_SIGN_TEAM_ID: macosTeamId
}

test('authorizes the fork Developer ID only for an explicitly reviewed master composition', () => {
  assert.equal(signedMacTeamId({}, tree), undefined)
  assert.equal(signedMacTeamId(signing, tree), macosTeamId)
  for (const override of [
    { GITHUB_REPOSITORY: 'stablyai/orca' },
    { GITHUB_REF: 'refs/heads/maintenance' },
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_EVENT_NAME: 'schedule' },
    { FORK_MAC_SIGN_TEAM_ID: '' },
    { FORK_MAC_SIGN_TREE: 'b'.repeat(40) }
  ]) {
    assert.throws(() => signedMacTeamId({ ...signing, ...override }, tree), /reviewed exact source/)
  }
})

test('binds the update manifest to the approved ZIP and measured macOS floor', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'orca-mac-update-manifest-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const version = '1.4.275-local.forkpreview.12345.abcdef123456'
  const zip = `Orca-${version}-arm64-mac.zip`
  const bytes = Buffer.from('verified ZIP bytes')
  const timestamp = '2026-11-25T00:00:00.000Z'
  const proof = {
    files: ['orca-macos-arm64.dmg', zip],
    validation: { unpacked: { minimumMacosVersion: '13.4' } }
  }
  const infoPath = join(directory, 'build-info.json')
  const expected = { version, macosTeamId }
  writeFileSync(infoPath, JSON.stringify(proof))
  writeFileSync(join(directory, zip), bytes)
  assert.throws(() => writeForkMacUpdateManifest(directory, expected, timestamp), /verified signed/)
  writeFileSync(infoPath, JSON.stringify({ ...proof, macosTeamId }))
  writeForkMacUpdateManifest(directory, expected, timestamp)
  const digest = createHash('sha512').update(bytes).digest('base64')
  assert.deepEqual(JSON.parse(readFileSync(join(directory, 'latest-mac.yml'), 'utf8')), {
    version,
    files: [{ url: zip, size: bytes.length, sha512: digest }],
    path: zip,
    sha512: digest,
    releaseDate: timestamp,
    minimumSystemVersion: '22.5.0'
  })
})
