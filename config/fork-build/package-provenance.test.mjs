import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { hashFile } from '../scripts/fork-upstream-archives.mjs'
import {
  packageIdentity,
  writeJson,
  writePackageReceipt,
  verifyPackageReceipt
} from './package-provenance.mjs'
import { measureWindowsArchives, WINDOWS_FILES } from './windows-packages.mjs'
import { assembleReleasePackages } from './release-packages.mjs'

const plan = {
  configuration: 'a'.repeat(40),
  upstream: 'b'.repeat(40),
  result: { commit: 'c'.repeat(40), tree: 'd'.repeat(40) },
  version: '1.4.214-local.forkpreview.123.cccccccccccc',
  fingerprint: 'e'.repeat(64),
  mobile: { applicationId: 'com.stably.orca.mobile', mobileVersion: '0.0.64', versionCode: 28 },
  outputs: [
    'macos-arm64-dmg',
    'macos-arm64-zip',
    'windows-x64-installer',
    'windows-x64-zip',
    'android-apk'
  ]
}
const roots = []
function temporary() {
  const directory = mkdtempSync(join(tmpdir(), 'orca-package-proof-'))
  roots.push(directory)
  return directory
}
afterEach(() =>
  roots.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }))
)

function executable(file, machine = 0x8664) {
  const bytes = Buffer.alloc(512)
  bytes.write('MZ')
  bytes.writeUInt32LE(128, 0x3c)
  bytes.write('PE\0\0', 128)
  bytes.writeUInt16LE(machine, 132)
  writeFileSync(file, bytes)
}

test('Windows extracted payloads must match in full, including source identity, PE architecture and version', () => {
  const directory = temporary()
  const identity = packageIdentity(plan, 'win32', 'x64')
  for (const format of ['zip', 'installer']) {
    const app = join(directory, format)
    mkdirSync(join(app, 'resources'), { recursive: true })
    executable(join(app, 'Orca.exe'))
    writeJson(join(app, 'resources/orca-personal-build.json'), identity)
    writeFileSync(join(app, 'resources/app.asar'), 'application')
  }
  writeJson(join(directory, 'product-versions.json'), {
    zip: plan.version,
    installer: plan.version
  })
  assert.equal(measureWindowsArchives(directory, identity).treeEntries, 4)
  writeFileSync(join(directory, 'installer/resources/app.asar'), 'different application')
  assert.throws(() => measureWindowsArchives(directory, identity), /different applications/)
  copyFileSync(
    join(directory, 'zip/resources/app.asar'),
    join(directory, 'installer/resources/app.asar')
  )
  executable(join(directory, 'installer/Orca.exe'), 0xaa64)
  assert.throws(() => measureWindowsArchives(directory, identity), /architecture/)
  executable(join(directory, 'installer/Orca.exe'))
  writeJson(join(directory, 'installer/resources/orca-personal-build.json'), {
    ...identity,
    commit: 'f'.repeat(40)
  })
  assert.throws(() => measureWindowsArchives(directory, identity), /identity/)
  writeJson(join(directory, 'installer/resources/orca-personal-build.json'), identity)
  writeJson(join(directory, 'product-versions.json'), { zip: plan.version, installer: '1.0.0' })
  assert.throws(() => measureWindowsArchives(directory, identity), /version/)
})

function platformReceipt(directory, name, identity, filenames) {
  mkdirSync(directory, { recursive: true })
  const files = filenames.map((file) => {
    writeFileSync(join(directory, file), file)
    return { file, sha256: hashFile(join(directory, file)) }
  })
  const proof = { identity, files }
  writePackageReceipt(directory, name, proof)
  writeJson(join(directory, `${name}-verified.json`), { ...proof, verified: true })
}

test('publication requires all platforms from the same source, and rejects altered downloads or receipts', () => {
  const root = temporary()
  const windows = join(root, 'windows')
  const android = join(root, 'android')
  const release = join(root, 'release')
  mkdirSync(release)
  writeJson(join(release, 'verified.json'), {
    commit: plan.result.commit,
    fingerprint: plan.fingerprint,
    verified: true
  })
  platformReceipt(windows, 'windows', packageIdentity(plan, 'win32', 'x64'), WINDOWS_FILES)
  assert.throws(() => assembleReleasePackages(plan, release, windows, android), /ENOENT/)
  platformReceipt(
    android,
    'android',
    { ...packageIdentity(plan, 'android', 'universal'), ...plan.mobile },
    ['orca-android.apk']
  )
  assembleReleasePackages(plan, release, windows, android)
  assert.throws(
    () =>
      assembleReleasePackages(
        { ...plan, outputs: plan.outputs.slice(0, 2) },
        release,
        windows,
        android
      ),
    /all five/
  )
  assert.throws(
    () =>
      assembleReleasePackages(
        { ...plan, result: { ...plan.result, commit: 'f'.repeat(40) } },
        release,
        windows,
        android
      ),
    /identity/
  )
  writeFileSync(join(windows, WINDOWS_FILES[0]), 'tampered')
  assert.throws(() => assembleReleasePackages(plan, release, windows, android), /bytes/)
})

test('checksum metadata cannot be silently replaced or point outside the package directory', () => {
  const directory = temporary()
  const identity = packageIdentity(plan, 'win32', 'x64')
  platformReceipt(directory, 'windows', identity, WINDOWS_FILES)
  writeFileSync(join(directory, 'windows-SHA256SUMS'), 'replaced')
  assert.throws(() => verifyPackageReceipt(directory, 'windows', identity), /checksum sidecar/)
  writePackageReceipt(directory, 'windows', {
    identity,
    files: [{ file: '../outside.exe', sha256: 'f'.repeat(64) }]
  })
  assert.throws(() => verifyPackageReceipt(directory, 'windows', identity), /bytes/)
})
