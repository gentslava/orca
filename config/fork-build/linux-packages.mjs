import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import floor from '../scripts/native-build/linux/verify-linux-glibc-floor.cjs'
import { appManifest, hashFile } from '../scripts/fork-upstream-archives.mjs'
import {
  assertIdentity,
  packageIdentity,
  stagePackageFiles,
  verifyPackageReceipt,
  writeJson,
  writePackageReceipt
} from './package-provenance.mjs'
import { linuxPackageTarget } from './package-targets.mjs'
import { extractLinuxPackage } from './linux-package-extraction.mjs'

function measureLinuxApp(app, expected, format) {
  const resources = join(app, 'resources')
  const identity = JSON.parse(readFileSync(join(resources, 'orca-personal-build.json'), 'utf8'))
  assertIdentity(identity, expected)
  const marker = readFileSync(join(resources, 'package-type'), 'utf8').trim()
  if (format !== 'unpacked' && marker !== format) {
    throw new Error('Linux package marker differs from its archive format')
  }
  if (
    floor.readElfMachine(join(app, 'orca-ide')) !== floor.ELF_MACHINE_BY_ARCH[expected.architecture]
  ) {
    throw new Error('Linux executable architecture differs from the source plan')
  }
  const node = join(resources, 'node-runtime/bin/node')
  if ((format === 'AppImage' || format === 'unpacked') !== existsSync(node)) {
    throw new Error('Linux package has the wrong AppImage Node runtime policy')
  }
  floor.verifyLinuxGlibcFloor(app, { targetArch: expected.architecture })
  const manifest = appManifest(app)
  const common = manifest.filter(
    ({ path }) =>
      path !== 'resources/package-type' &&
      path !== 'resources/node-runtime' &&
      !path.startsWith('resources/node-runtime/')
  )
  const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  return {
    identity,
    format,
    packageType: marker,
    executableSha256: hashFile(join(app, 'orca-ide')),
    appAsarSha256: hashFile(join(resources, 'app.asar')),
    commonTreeSha256: hash(common),
    treeSha256: hash(manifest),
    treeEntries: manifest.length,
    nativeFloor: floor.FLOOR_LABEL
  }
}

function measureLinuxArchives(plan, directory, architecture) {
  const target = linuxPackageTarget(plan, architecture)
  const expected = packageIdentity(plan, 'linux', architecture)
  const temporary = mkdtempSync(join(tmpdir(), `orca-linux-${architecture}-`))
  try {
    return target.files.map((file, index) => {
      const format = ['AppImage', 'deb', 'rpm'][index]
      const app = extractLinuxPackage(
        resolve(directory, file),
        format,
        join(temporary, format),
        architecture
      )
      return measureLinuxApp(app, expected, format)
    })
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

export function stageLinuxPackages(plan, application, architecture) {
  const target = linuxPackageTarget(plan, architecture)
  const expected = packageIdentity(plan, 'linux', architecture)
  const apps = measureLinuxArchives(plan, join(application, 'dist'), architecture)
  const unpacked = measureLinuxApp(
    join(application, 'dist', architecture === 'x64' ? 'linux-unpacked' : 'linux-arm64-unpacked'),
    expected,
    'unpacked'
  )
  if (apps.some((app) => app.commonTreeSha256 !== unpacked.commonTreeSha256)) {
    throw new Error('Linux package contents differ from the frozen unpacked application')
  }
  const directory = join(application, 'personal-packages')
  writePackageReceipt(directory, target.id, {
    identity: expected,
    files: stagePackageFiles(directory, join(application, 'dist'), target.files),
    apps,
    signing: 'unsigned'
  })
}

export function verifyLinuxPackages(plan, directory, architecture) {
  const target = linuxPackageTarget(plan, architecture)
  const proof = verifyPackageReceipt(
    directory,
    target.id,
    packageIdentity(plan, 'linux', architecture)
  )
  if (
    !isDeepStrictEqual(
      proof.files.map(({ file }) => file),
      target.files
    ) ||
    !isDeepStrictEqual(proof.apps, measureLinuxArchives(plan, directory, architecture))
  ) {
    throw new Error('Linux archive contents differ from their independent verification')
  }
  writeJson(join(directory, `${target.id}-verified.json`), { ...proof, verified: true })
}
