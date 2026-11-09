import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pe from '../scripts/native-build/windows/windows-pe-machine.cjs'
import { appManifest, hashFile } from '../scripts/fork-upstream-archives.mjs'
import {
  assertIdentity,
  packageIdentity,
  stagePackageFiles,
  verifyPackageReceipt,
  writeJson,
  writePackageReceipt
} from './package-provenance.mjs'

export const WINDOWS_FILES = ['orca-windows-setup.exe', 'orca-windows-x64.zip']

export function measureWindowsApp(app, expected, productVersion) {
  const identity = JSON.parse(readFileSync(join(app, 'resources/orca-personal-build.json'), 'utf8'))
  assertIdentity(identity, expected)
  if (
    productVersion !== expected.version ||
    pe.readPeMachine(join(app, 'Orca.exe')) !== pe.PE_MACHINE.x64
  ) {
    throw new Error('Windows executable version or architecture differs from the source plan')
  }
  const manifest = appManifest(app, { executableMode: false })
  return {
    identity,
    productVersion,
    executableSha256: hashFile(join(app, 'Orca.exe')),
    appAsarSha256: hashFile(join(app, 'resources/app.asar')),
    treeSha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
    treeEntries: manifest.length
  }
}

export function measureWindowsArchives(verification, expected) {
  const versions = JSON.parse(readFileSync(join(verification, 'product-versions.json'), 'utf8'))
  const zip = measureWindowsApp(join(verification, 'zip'), expected, versions.zip)
  const installer = measureWindowsApp(join(verification, 'installer'), expected, versions.installer)
  if (JSON.stringify(zip) !== JSON.stringify(installer)) {
    throw new Error('Windows installer and ZIP contain different applications')
  }
  return zip
}

export function stageWindowsPackages(plan, application, verification) {
  const expected = packageIdentity(plan, 'win32', 'x64')
  const proof = measureWindowsArchives(verification, expected)
  const unpacked = measureWindowsApp(
    join(application, 'dist/win-unpacked'),
    expected,
    proof.productVersion
  )
  if (JSON.stringify(proof) !== JSON.stringify(unpacked)) {
    throw new Error('Windows archives differ from the validated unpacked application')
  }
  const directory = join(application, 'personal-packages')
  const files = stagePackageFiles(directory, join(application, 'dist'), WINDOWS_FILES)
  writePackageReceipt(directory, 'windows', {
    identity: expected,
    files,
    app: proof,
    signing: 'unsigned'
  })
}

export function verifyWindowsPackages(plan, directory, verification) {
  const expected = packageIdentity(plan, 'win32', 'x64')
  const proof = verifyPackageReceipt(directory, 'windows', expected)
  if (
    JSON.stringify(proof.files.map(({ file }) => file)) !== JSON.stringify(WINDOWS_FILES) ||
    JSON.stringify(measureWindowsArchives(verification, expected)) !== JSON.stringify(proof.app)
  ) {
    throw new Error('Windows archive contents differ from their staged proof')
  }
  writeJson(join(directory, 'windows-verified.json'), { ...proof, verified: true })
}
