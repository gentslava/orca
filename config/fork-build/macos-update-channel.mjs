import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { hashFile } from '../scripts/fork-upstream-archives.mjs'
import { darwinVersionForMacos } from '../../src/shared/updater/requirements/macos-darwin-floor.ts'

export function signedMacTeamId(environment, tree) {
  const requestedTree = environment.FORK_MAC_SIGN_TREE
  if (!requestedTree) {
    return undefined
  }
  if (
    environment.GITHUB_REPOSITORY !== 'gentslava/orca' ||
    environment.GITHUB_REF !== 'refs/heads/master' ||
    environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    !/^[0-9a-f]{40}$/.test(requestedTree) ||
    requestedTree !== tree ||
    !/^[A-Z0-9]{10}$/.test(environment.FORK_MAC_SIGN_TEAM_ID ?? '')
  ) {
    throw new Error(
      'macOS update signing requires a reviewed exact source tree and fork Developer ID team'
    )
  }
  return environment.FORK_MAC_SIGN_TEAM_ID
}

export function writeForkMacUpdateManifest(directory, expected, timestamp) {
  const info = JSON.parse(readFileSync(join(directory, 'build-info.json'), 'utf8'))
  const zip = `Orca-${expected.version}-arm64-mac.zip`
  if (
    info.macosTeamId !== expected.macosTeamId ||
    !info.validation.unpacked.minimumMacosVersion ||
    !info.files.includes(zip)
  ) {
    throw new Error('Expected the independently verified signed ARM64 update ZIP')
  }
  const archive = join(directory, zip)
  const sha512 = hashFile(archive, 'sha512', 'base64')
  const minimumSystemVersion = darwinVersionForMacos(info.validation.unpacked.minimumMacosVersion)
  const manifest = {
    version: expected.version,
    files: [{ url: zip, sha512, size: statSync(archive).size }],
    path: zip,
    sha512,
    releaseDate: timestamp,
    minimumSystemVersion
  }
  writeFileSync(join(directory, 'latest-mac.yml'), `${JSON.stringify(manifest, null, 2)}\n`)
}
