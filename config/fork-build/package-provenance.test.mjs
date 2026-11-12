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
import { androidSigningCertificate } from './android-packages.mjs'
import { assembleReleasePackages } from './release-packages.mjs'
import { packageTargets } from './package-targets.mjs'

const plan = {
  configuration: 'a'.repeat(40),
  upstream: 'b'.repeat(40),
  result: { commit: 'c'.repeat(40), tree: 'd'.repeat(40) },
  version: '1.4.255-local.forkpreview.123.cccccccccccc',
  fingerprint: 'e'.repeat(64),
  mobile: { applicationId: 'com.stably.orca.mobile', mobileVersion: '0.0.64', versionCode: 28 },
  outputs: [
    'macos-arm64-dmg',
    'macos-arm64-zip',
    'windows-x64-installer',
    'windows-x64-zip',
    'android-apk',
    'linux-x64-appimage',
    'linux-x64-deb',
    'linux-x64-rpm',
    'linux-arm64-appimage',
    'linux-arm64-deb',
    'linux-arm64-rpm'
  ]
}
plan.targets = packageTargets(plan.outputs)
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
  const versions = { productVersion: '1.4.255.0', fileVersion: plan.version }
  writeJson(join(directory, 'product-versions.json'), { zip: versions, installer: versions })
  assert.equal(measureWindowsArchives(directory, identity).treeEntries, 4)
  executable(join(directory, 'installer/resources/elevate.exe'))
  assert.throws(() => measureWindowsArchives(directory, identity), /different applications/)
  copyFileSync(
    join(directory, 'installer/resources/elevate.exe'),
    join(directory, 'zip/resources/elevate.exe')
  )
  assert.equal(measureWindowsArchives(directory, identity).treeEntries, 5)
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
  for (const mismatch of [
    { ...versions, productVersion: '1.4.254.0' },
    { ...versions, fileVersion: '1.4.255-local.forkpreview.122.cccccccccccc' }
  ]) {
    writeJson(join(directory, 'product-versions.json'), { zip: versions, installer: mismatch })
    assert.throws(() => measureWindowsArchives(directory, identity), /version/)
  }
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
  const linux = join(root, 'linux')
  const release = join(root, 'release')
  mkdirSync(release)
  writeJson(join(release, 'verified.json'), {
    commit: plan.result.commit,
    fingerprint: plan.fingerprint,
    verified: true
  })
  platformReceipt(windows, 'windows', packageIdentity(plan, 'win32', 'x64'), WINDOWS_FILES)
  assert.throws(() => assembleReleasePackages(plan, release, windows, android, linux), /ENOENT/)
  platformReceipt(
    android,
    'android',
    { ...packageIdentity(plan, 'android', 'universal'), ...plan.mobile },
    ['orca-android.apk']
  )
  assert.throws(() => assembleReleasePackages(plan, release, windows, android, linux), /ENOENT/)
  platformReceipt(join(linux, 'linux-x64'), 'linux-x64', packageIdentity(plan, 'linux', 'x64'), [
    'orca-linux.AppImage',
    'orca-linux-x64.deb',
    'orca-linux-x64.rpm'
  ])
  assert.throws(() => assembleReleasePackages(plan, release, windows, android, linux), /ENOENT/)
  const armFiles = ['orca-linux-arm64.AppImage', 'orca-linux-arm64.deb', 'orca-linux-arm64.rpm']
  const armDirectory = join(linux, 'linux-arm64')
  platformReceipt(armDirectory, 'linux-arm64', packageIdentity(plan, 'linux', 'x64'), armFiles)
  assert.throws(() => assembleReleasePackages(plan, release, windows, android, linux), /identity/)
  platformReceipt(armDirectory, 'linux-arm64', packageIdentity(plan, 'linux', 'arm64'), armFiles)
  assembleReleasePackages(plan, release, windows, android, linux)
  assert.throws(
    () =>
      assembleReleasePackages(
        { ...plan, result: { ...plan.result, commit: 'f'.repeat(40) } },
        release,
        windows,
        android,
        linux
      ),
    /identity/
  )
  writeFileSync(join(windows, WINDOWS_FILES[0]), 'tampered')
  assert.throws(() => assembleReleasePackages(plan, release, windows, android, linux), /bytes/)
  platformReceipt(windows, 'windows', packageIdentity(plan, 'win32', 'x64'), WINDOWS_FILES)
  writeFileSync(join(armDirectory, 'orca-linux-arm64.rpm'), 'tampered Linux archive')
  assert.throws(() => assembleReleasePackages(plan, release, windows, android, linux), /bytes/)
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

test('Android SDK signer labels preserve the pinned single-certificate policy', () => {
  const digest = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c'
  const report = `V2 Signer: certificate DN: CN=Android Debug, OU=Android
V2 Signer: certificate SHA-256 digest: ${digest}
V2 Signer: certificate SHA-1 digest: 5e8f16062ea3cd2c4a0d547876baa6f38cabf625
`
  assert.equal(androidSigningCertificate(report), digest)
  assert.equal(androidSigningCertificate(report.replaceAll('V2 Signer:', 'Signer #1')), digest)
  assert.equal(androidSigningCertificate(report.replaceAll('\n', '\r\n')), digest)
  for (const invalid of [
    '',
    report.replace(digest, 'a'.repeat(64)),
    `${report}${report}`,
    `${report}Unknown signer: certificate SHA-256 digest: ${'a'.repeat(64)}\n`,
    report.replace('V2 Signer: certificate SHA-256', 'Unknown signer: certificate SHA-256')
  ]) {
    assert.throws(() => androidSigningCertificate(invalid), /certificate differs/)
  }
})
