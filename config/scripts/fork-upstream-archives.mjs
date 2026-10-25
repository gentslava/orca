import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readlinkSync,
  readSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import macCompatibility from './mac-build-compatibility.cjs'
import { isDirectInvocation } from './script-entry-detection.mjs'

const { MAC_BUILD_COMPATIBILITY_FILENAME, createMacBuildCompatibility } = macCompatibility

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function hashFile(file) {
  const hash = createHash('sha256')
  const buffer = Buffer.alloc(1024 * 1024)
  const fd = openSync(file, 'r')
  try {
    let size
    while ((size = readSync(fd, buffer, 0, buffer.length, null))) {
      hash.update(buffer.subarray(0, size))
    }
    return hash.digest('hex')
  } finally {
    closeSync(fd)
  }
}

function macTool(program, args) {
  if (process.platform !== 'darwin') {
    throw new Error('Fork preview archive validation requires macOS')
  }
  return execFileSync(program, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function appManifest(app) {
  const entries = []
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const file = join(directory, name)
      const path = relative(app, file).split(sep).join('/')
      const stat = lstatSync(file)
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(file)
        const destination = relative(app, resolve(dirname(file), target))
        if (destination === '..' || destination.startsWith(`..${sep}`)) {
          throw new Error(`App symlink escapes its bundle: ${path}`)
        }
        entries.push({ path, type: 'symlink', target })
      } else if (stat.isDirectory()) {
        entries.push({ path, type: 'directory' })
        visit(file)
      } else if (stat.isFile()) {
        entries.push({ path, type: 'file', executable: stat.mode & 0o111, sha256: hashFile(file) })
      } else {
        throw new Error(`Unsupported app entry: ${path}`)
      }
    }
  }
  visit(app)
  return entries
}

function assertExpectedIdentity({ commit, version }) {
  if (
    typeof commit !== 'string' ||
    !/^[0-9a-f]{40}$/.test(commit) ||
    typeof version !== 'string' ||
    !/[.-]local\.forkpreview\.\d+\.[0-9a-f]{12}$/.test(version) ||
    !version.endsWith(`.${commit.slice(0, 12)}`)
  ) {
    throw new Error('Expected a pinned commit and matching fork-preview version')
  }
}

export function measurePreviewApp(app, expected) {
  assertExpectedIdentity(expected)
  if (!lstatSync(app).isDirectory() || lstatSync(app).isSymbolicLink()) {
    throw new Error('Expected a real application bundle')
  }
  const resources = join(app, 'Contents', 'Resources')
  const identity = JSON.parse(
    readFileSync(join(resources, MAC_BUILD_COMPATIBILITY_FILENAME), 'utf8')
  )
  const contract = createMacBuildCompatibility({ ...expected, architecture: 'arm64' })
  if (
    Object.entries(contract).some(
      ([key, value]) => JSON.stringify(identity[key]) !== JSON.stringify(value)
    )
  ) {
    throw new Error('Embedded app source/version/architecture proof differs from the candidate')
  }
  const plist = join(app, 'Contents', 'Info.plist')
  const version = macTool('/usr/libexec/PlistBuddy', [
    '-c',
    'Print :CFBundleShortVersionString',
    plist
  ])
  const executable = macTool('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', plist])
  if (version !== expected.version || executable !== basename(executable) || !executable) {
    throw new Error('App plist differs from the expected preview identity')
  }
  const binary = join(app, 'Contents', 'MacOS', executable)
  const architectures = macTool('/usr/bin/lipo', ['-archs', binary]).split(/\s+/)
  if (architectures.length !== 1 || architectures[0] !== 'arm64') {
    throw new Error('Preview executable must contain exactly the arm64 architecture')
  }
  macTool('/usr/bin/codesign', ['--verify', '--deep', '--strict', app])
  const manifest = appManifest(app)
  return {
    identity,
    executable,
    architectures,
    codesign: 'verified-deep-strict',
    appAsarSha256: hashFile(join(resources, 'app.asar')),
    executableSha256: hashFile(binary),
    treeSha256: sha256(JSON.stringify(manifest)),
    manifest
  }
}

function appProof({ manifest, ...proof }) {
  return { ...proof, treeEntries: manifest.length }
}

function sameApp(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Archive application differs from the validated unpacked app')
  }
}

function measureArchive(file, expected) {
  const temporary = mkdtempSync(join(tmpdir(), 'orca-fork-archive-'))
  const format = extname(file).slice(1)
  const contents = join(temporary, 'contents')
  mkdirSync(contents)
  let mounted = false
  try {
    if (format === 'dmg') {
      // A fixed mount point permits cleanup even when attach output cannot be parsed.
      macTool('/usr/bin/hdiutil', [
        'attach',
        '-readonly',
        '-nobrowse',
        '-noautoopen',
        '-mountpoint',
        contents,
        resolve(file)
      ])
      mounted = true
    } else if (format === 'zip') {
      macTool('/usr/bin/ditto', ['-x', '-k', resolve(file), contents])
    } else {
      throw new Error(`Unsupported preview archive: ${file}`)
    }
    const apps = readdirSync(contents).filter((name) => name.endsWith('.app'))
    if (apps.length !== 1) {
      throw new Error(`Expected exactly one app in ${basename(file)}, got ${apps.length}`)
    }
    return appProof(measurePreviewApp(join(contents, apps[0]), expected))
  } finally {
    try {
      if (mounted) {
        macTool('/usr/bin/hdiutil', ['detach', contents])
        mounted = false
      }
    } finally {
      // Never recursively remove a mount that failed to detach.
      if (!mounted) {
        rmSync(temporary, { recursive: true, force: true })
      }
    }
  }
}

function requestedFormats(formats) {
  if (!['dmg', 'both'].includes(formats)) {
    throw new Error('Unsupported preview formats')
  }
  return formats === 'both' ? ['dmg', 'zip'] : ['dmg']
}

export function stagePreviewArchives({
  app,
  dist,
  directory,
  commit,
  version,
  formats,
  metadata = {}
}) {
  assertExpectedIdentity({ commit, version })
  const unpacked = measurePreviewApp(app, { commit, version })
  const proof = appProof(unpacked)
  const files = requestedFormats(formats).map((format) => {
    const matches = readdirSync(dist).filter(
      (file) => file.endsWith(`.${format}`) && lstatSync(join(dist, file)).isFile()
    )
    if (matches.length !== 1) {
      throw new Error(`Expected one .${format} artifact, got ${matches.length}`)
    }
    return matches[0]
  })
  mkdirSync(directory, { recursive: true })
  const archives = files.map((file) => {
    const staged = join(directory, file)
    copyFileSync(join(dist, file), staged)
    const measured = measureArchive(staged, { commit, version })
    sameApp(measured, proof)
    return { file, sha256: hashFile(staged), app: measured }
  })
  const info = {
    ...metadata,
    commit: unpacked.identity.commit,
    version: unpacked.identity.version,
    architecture: unpacked.identity.architecture,
    formats,
    files,
    validation: { schemaVersion: 1, unpacked: proof, archives }
  }
  writeFileSync(
    join(directory, 'app-tree-manifest.json'),
    `${JSON.stringify(unpacked.manifest, null, 2)}\n`
  )
  writeFileSync(
    join(directory, 'SHA256SUMS'),
    `${archives.map(({ file, sha256 }) => `${sha256}  ${file}`).join('\n')}\n`
  )
  writeFileSync(join(directory, 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`)
  return info
}

export function verifyStagedArchives(directory, expected) {
  assertExpectedIdentity(expected)
  const info = JSON.parse(readFileSync(join(directory, 'build-info.json'), 'utf8'))
  const formats = requestedFormats(expected.formats)
  const validation = info.validation
  if (
    info.commit !== expected.commit ||
    info.version !== expected.version ||
    info.architecture !== 'arm64' ||
    info.formats !== expected.formats ||
    info.forkMaster !== expected.forkSha ||
    info.upstreamMain !== expected.upstreamSha ||
    validation?.schemaVersion !== 1 ||
    !Array.isArray(info.files) ||
    info.files.length !== formats.length ||
    !Array.isArray(validation.archives) ||
    validation.archives.length !== formats.length ||
    !formats.every(
      (format) =>
        info.files.filter(
          (file) =>
            typeof file === 'string' && file === basename(file) && file.endsWith(`.${format}`)
        ).length === 1
    )
  ) {
    throw new Error(
      'Archive metadata does not describe all requested candidate formats and measured proof'
    )
  }
  const manifest = JSON.parse(readFileSync(join(directory, 'app-tree-manifest.json'), 'utf8'))
  if (sha256(JSON.stringify(manifest)) !== validation.unpacked?.treeSha256) {
    throw new Error('Unpacked app manifest differs from its measured proof')
  }
  for (const file of info.files) {
    const records = validation.archives.filter((archive) => archive.file === file)
    const archive = records[0]
    if (records.length !== 1 || hashFile(join(directory, file)) !== archive.sha256) {
      throw new Error('Staged archive bytes differ from their measured proof')
    }
    const measured = measureArchive(join(directory, file), expected)
    sameApp(measured, validation.unpacked)
    sameApp(measured, archive.app)
  }
  return validation
}

if (isDirectInvocation(import.meta.url, process.argv[1])) {
  stagePreviewArchives({
    app: 'dist/mac-arm64/Orca.app',
    dist: 'dist',
    directory: '.build/fork-preview',
    commit: process.env.ORCA_BUILD_COMMIT,
    version: process.env.ORCA_LOCAL_BUILD_VERSION,
    formats: process.env.PREVIEW_FORMATS,
    metadata: {
      repository: process.env.GITHUB_REPOSITORY,
      forkMaster: process.env.FORK_MASTER_SHA,
      upstreamMain: process.env.UPSTREAM_MAIN_SHA,
      workflowCommit: process.env.GITHUB_SHA,
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
      developerIdSigned: false,
      notarized: false,
      bundledOrcadDeploymentTemplate: false,
      requiresForkPreviewUpdaterGuard: true
    }
  })
}
