import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import macCompatibility from './mac-build-compatibility.cjs'
import {
  measurePreviewApp,
  stagePreviewArchives,
  verifyStagedArchives
} from './fork-upstream-archives.mjs'
import { sealCandidate } from './fork-upstream-sync.mjs'

const commit = 'a'.repeat(40)
const version = `1.2.3-local.forkpreview.123.${commit.slice(0, 12)}`
const expected = {
  commit,
  version,
  formats: 'both',
  forkSha: 'b'.repeat(40),
  upstreamSha: 'c'.repeat(40)
}
const roots = []
let executable

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function run(program, args, options = {}) {
  try {
    return execFileSync(program, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    })
  } catch (error) {
    throw new Error(`${program} failed: ${error.stderr?.toString() || error.message}`, {
      cause: error
    })
  }
}

function sign(app) {
  run('/usr/bin/codesign', ['--force', '--sign', '-', app])
}

function fixture(identity = { commit, version }) {
  const root = mkdtempSync(join(tmpdir(), 'orca-fork-archive-test-'))
  roots.push(root)
  const app = join(root, 'Orca.app')
  const resources = join(app, 'Contents', 'Resources')
  mkdirSync(resources, { recursive: true })
  mkdirSync(join(app, 'Contents', 'MacOS'))
  writeFileSync(join(resources, 'app.asar'), 'fixture application payload')
  writeFileSync(join(resources, 'extra-resource.txt'), 'fixture resource')
  macCompatibility.writeMacBuildCompatibility(resources, { ...identity, architecture: 'arm64' })
  writeFileSync(
    join(app, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Orca</string>
<key>CFBundleIdentifier</key><string>io.orca.archive-fixture</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${identity.version}</string>
</dict></plist>`
  )
  copyFileSync(executable, join(app, 'Contents', 'MacOS', 'Orca'))
  sign(app)
  const dist = join(root, 'dist')
  const directory = join(root, 'stage')
  mkdirSync(dist)
  const options = {
    app,
    dist,
    directory,
    ...identity,
    formats: 'both',
    metadata: { forkMaster: expected.forkSha, upstreamMain: expected.upstreamSha }
  }
  return { root, app, resources, dist, directory, options }
}

function archive(f, format = 'zip') {
  const file = join(f.dist, `orca.${format}`)
  rmSync(file, { force: true })
  if (format === 'zip') {
    run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', f.app, file])
  } else {
    const source = join(f.root, 'dmg-source')
    mkdirSync(source, { recursive: true })
    run('/usr/bin/ditto', [f.app, join(source, 'Orca.app')])
    run('/usr/bin/hdiutil', ['create', '-quiet', '-format', 'UDZO', '-srcfolder', source, file])
  }
}

describe.skipIf(process.platform !== 'darwin')('real headless macOS preview archives', () => {
  beforeAll(() => {
    const root = mkdtempSync(join(tmpdir(), 'orca-fork-fixture-binary-'))
    executable = join(root, 'Orca')
    run('/usr/bin/clang', ['-arch', 'arm64', '-x', 'c', '-o', executable, '-'], {
      input: 'int main(void) { return 0; }\n'
    })
    return () => rmSync(root, { recursive: true, force: true })
  })

  it('measures both actual archive apps and rechecks them at seal, binding all resources and the embedded identity', () => {
    const f = fixture()
    archive(f)
    archive(f, 'dmg')
    const info = stagePreviewArchives(f.options)
    expect(info.validation.archives).toHaveLength(2)
    for (const record of info.validation.archives) {
      expect(record.app).toEqual(info.validation.unpacked)
      expect(record.app).toMatchObject({
        identity: { commit, version, architecture: 'arm64' },
        codesign: 'verified-deep-strict',
        architectures: ['arm64']
      })
    }
    expect(verifyStagedArchives(f.directory, expected)).toEqual(info.validation)
    const repo = join(f.root, 'repo')
    mkdirSync(repo)
    run('git', ['init', '-b', 'master', repo])
    run('git', [
      '-C',
      repo,
      '-c',
      'user.name=Archive fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--allow-empty',
      '-m',
      'fixture'
    ])
    const candidateSha = run('git', ['-C', repo, 'rev-parse', 'HEAD']).trim()
    const candidate = {
      repository: 'gentslava/orca',
      event: 'workflow_dispatch',
      build: true,
      ...expected,
      candidateSha,
      version: `1.2.3-local.forkpreview.123.${candidateSha.slice(0, 12)}`
    }
    writeFileSync(
      join(f.directory, 'build-info.json'),
      JSON.stringify({
        ...info,
        commit: candidateSha,
        version: candidate.version
      })
    )
    expect(() => sealCandidate(repo, candidate, f.root, f.directory)).toThrow(/Embedded app source/)
    expect(readFileSync(join(f.directory, 'app-tree-manifest.json'), 'utf8')).toContain(
      'extra-resource.txt'
    )
    const valid = fixture({ commit: candidateSha, version: candidate.version })
    archive(valid)
    archive(valid, 'dmg')
    const measured = stagePreviewArchives({
      ...valid.options,
      metadata: { forkMaster: candidateSha, upstreamMain: candidateSha }
    })
    sealCandidate(
      repo,
      { ...candidate, forkSha: candidateSha, upstreamSha: candidateSha },
      valid.root,
      valid.directory
    )
    expect(
      JSON.parse(readFileSync(join(valid.root, 'candidate.json'), 'utf8')).archiveValidation
    ).toEqual(measured.validation)
  })

  it('rejects a fake-text DMG before staging metadata or allowing seal', () => {
    const f = fixture()
    writeFileSync(join(f.dist, 'orca.dmg'), 'THIS IS NOT A DMG AND CONTAINS NO APPLICATION')
    expect(() => stagePreviewArchives({ ...f.options, formats: 'dmg' })).toThrow()
  })

  it.each([
    ['commit', 'd'.repeat(40)],
    ['version', '1.2.3'],
    ['architecture', 'x64']
  ])('rejects a signed ZIP whose embedded %s proof differs from the candidate', (field, value) => {
    const f = fixture()
    const metadata = join(f.resources, 'orca-local-build.json')
    const original = readFileSync(metadata)
    const identity = JSON.parse(original.toString())
    writeFileSync(metadata, JSON.stringify({ ...identity, [field]: value }))
    sign(f.app)
    archive(f)
    writeFileSync(metadata, original)
    sign(f.app)
    // First archive is valid; the ZIP remains signed but contains the stale identity.
    archive(f, 'dmg')
    expect(() => stagePreviewArchives(f.options)).toThrow(/Embedded app source/)
  })

  it.each(['app.asar', 'extra-resource.txt'])(
    'rejects a signed stale archive with different %s bytes',
    (file) => {
      const f = fixture()
      archive(f)
      writeFileSync(join(f.resources, file), 'updated tested payload')
      sign(f.app)
      archive(f, 'dmg')
      expect(() => stagePreviewArchives(f.options)).toThrow(
        /differs from the validated unpacked app/
      )
    }
  )

  it('reopens archives at seal even when a corrupt replacement has a matching forged checksum', () => {
    const f = fixture()
    archive(f)
    archive(f, 'dmg')
    stagePreviewArchives(f.options)
    writeFileSync(join(f.directory, 'orca.dmg'), 'not a disk image')
    expect(() => verifyStagedArchives(f.directory, expected)).toThrow(/bytes differ/)
    const info = JSON.parse(readFileSync(join(f.directory, 'build-info.json'), 'utf8'))
    info.validation.archives[0].sha256 = createHash('sha256')
      .update('not a disk image')
      .digest('hex')
    writeFileSync(join(f.directory, 'build-info.json'), JSON.stringify(info))
    expect(() => verifyStagedArchives(f.directory, expected)).toThrow()
  })

  it('rejects an unguarded plist version even when embedded metadata claims the expected preview', () => {
    const f = fixture()
    run('/usr/libexec/PlistBuddy', [
      '-c',
      'Set :CFBundleShortVersionString 1.2.3',
      join(f.app, 'Contents', 'Info.plist')
    ])
    sign(f.app)
    expect(() => measurePreviewApp(f.app, expected)).toThrow(/plist/)
  })
})
