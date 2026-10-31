import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { api, readLedger } from './github.mjs'
import { measurePreviewApp } from '../scripts/fork-upstream-archives.mjs'
import { isDirectInvocation } from '../scripts/script-entry-detection.mjs'

const repository = 'gentslava/orca'

export function assertAssetBytes(asset, bytes) {
  if (!/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) {
    throw new Error(`Missing GitHub asset digest: ${asset.name}`)
  }
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  if (digest !== asset.digest) {
    throw new Error(`Downloaded asset differs from the published release: ${asset.name}`)
  }
}

export function replaceApplication(staged, destination, backup) {
  if (existsSync(backup)) {
    throw new Error('Application backup already exists')
  }
  const previous = existsSync(destination)
  if (previous) {
    renameSync(destination, backup)
  }
  try {
    renameSync(staged, destination)
  } catch (error) {
    if (previous) {
      try {
        renameSync(backup, destination)
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `Previous application retained at ${backup}`
        )
      }
    }
    throw error
  }
}

function tool(program, args) {
  return execFileSync(program, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024
  })
}

function runningBundleProcesses(destination) {
  const prefix = `${destination}/Contents/`
  return tool('/bin/ps', ['-axo', 'pid=,command='])
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(.+)$/))
    .filter((match) => match && match[2].startsWith(prefix))
    .map((match) => Number(match[1]))
}

async function requireStoppedApplication(destination, wait) {
  const deadline = Date.now() + 5 * 60 * 1000
  let announced = false
  while (runningBundleProcesses(destination).length) {
    if (!wait || Date.now() >= deadline) {
      throw new Error(
        'Quit Orca completely, then run this installer from Terminal. No app was replaced.'
      )
    }
    if (!announced) {
      console.log('The verified build is ready. Quit Orca completely to finish installation.')
      announced = true
    }
    await setTimeout(1000)
  }
}

function parseOptions(args) {
  const options = { destination: '/Applications/Orca.app', wait: false, launch: false }
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--wait') {
      options.wait = true
    } else if (argument === '--launch') {
      options.launch = true
    } else if (['--release', '--destination', '--assets-directory'].includes(argument)) {
      const value = args[++index]
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${argument}`)
      }
      if (argument === '--release') {
        options.release = value
      }
      if (argument === '--destination') {
        options.destination = value
      }
      if (argument === '--assets-directory') {
        options.assetsDirectory = resolve(value)
      }
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  options.destination = resolve(options.destination)
  if (!options.destination.endsWith('.app')) {
    throw new Error('Destination must be an .app bundle')
  }
  if (options.release && !/^personal-\d+-\d+$/.test(options.release)) {
    throw new Error('Expected an immutable personal build tag')
  }
  return options
}

function verifyApplication(application, info) {
  const { manifest, ...measured } = measurePreviewApp(application, info)
  assert.deepEqual({ ...measured, treeEntries: manifest.length }, info.validation.unpacked)
}

async function install(options) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('This installer requires an Apple Silicon Mac')
  }
  const ledger = options.release ? null : readLedger(api(`repos/${repository}/issues/12`).body)
  const tag = options.release || (ledger.lastGood?.promoted && ledger.lastGood.tag)
  if (!/^personal-\d+-\d+$/.test(tag || '')) {
    throw new Error('No verified personal release is available')
  }
  const release = api(`repos/${repository}/releases/tags/${tag}`)
  if (release.draft || release.tag_name !== tag) {
    throw new Error('Release is not published')
  }
  const images = release.assets.filter((asset) => asset.name.endsWith('.dmg'))
  const metadata = release.assets.find((asset) => asset.name === 'build-info.json')
  if (images.length !== 1 || !metadata) {
    throw new Error('Release is missing its image or source proof')
  }
  const assets = [metadata, images[0]]
  for (const asset of assets) {
    if (
      basename(asset.name) !== asset.name ||
      !asset.browser_download_url.startsWith(
        `https://github.com/${repository}/releases/download/${tag}/`
      )
    ) {
      throw new Error('Release asset has an unexpected name or origin')
    }
  }
  const scratch = mkdtempSync(join(tmpdir(), 'orca-personal-install-'))
  const mount = join(scratch, 'mounted')
  mkdirSync(mount)
  let mounted = false
  let stage
  try {
    const downloads = options.assetsDirectory || join(scratch, 'downloads')
    if (!options.assetsDirectory) {
      mkdirSync(downloads)
      tool('gh', [
        'release',
        'download',
        tag,
        '--repo',
        repository,
        '--dir',
        downloads,
        ...assets.flatMap((asset) => ['--pattern', asset.name])
      ])
    }
    for (const asset of assets) {
      assertAssetBytes(asset, readFileSync(join(downloads, asset.name)))
    }
    const info = JSON.parse(readFileSync(join(downloads, metadata.name), 'utf8'))
    const archive = info.validation?.archives?.find((entry) => entry.file === images[0].name)
    if (
      !archive ||
      `sha256:${archive.sha256}` !== images[0].digest ||
      info.architecture !== 'arm64' ||
      !/^[a-f0-9]{40}$/.test(info.commit || '')
    ) {
      throw new Error('Package provenance does not match the published image')
    }
    tool('/usr/bin/hdiutil', [
      'attach',
      '-readonly',
      '-nobrowse',
      '-noautoopen',
      '-mountpoint',
      mount,
      join(downloads, images[0].name)
    ])
    mounted = true
    const application = join(mount, 'Orca.app')
    verifyApplication(application, info)
    if (existsSync(options.destination)) {
      if (lstatSync(options.destination).isSymbolicLink()) {
        throw new Error('Refusing a symlink destination')
      }
      const identifier = tool('/usr/libexec/PlistBuddy', [
        '-c',
        'Print :CFBundleIdentifier',
        join(options.destination, 'Contents/Info.plist')
      ]).trim()
      if (identifier !== 'com.stablyai.orca') {
        throw new Error('Destination is not an Orca application')
      }
    }
    mkdirSync(dirname(options.destination), { recursive: true })
    stage = mkdtempSync(join(dirname(options.destination), '.orca-personal-install-'))
    const candidate = join(stage, 'Orca.app')
    tool('/usr/bin/ditto', ['--noqtn', application, candidate])
    verifyApplication(candidate, info)
    const attributes = tool('/usr/bin/xattr', ['-r', candidate])
    if (attributes.includes('com.apple.quarantine')) {
      throw new Error('Quarantine remained on the staged app')
    }
    console.log(`Verified ${tag}: ${info.version}, source ${info.commit}`)
    await requireStoppedApplication(options.destination, options.wait)
    const backup = join(stage, 'Previous Orca.app')
    replaceApplication(candidate, options.destination, backup)
    console.log(`Installed ${options.destination}`)
    if (existsSync(backup)) {
      console.log(`Previous application retained at ${backup}`)
    }
    if (options.launch) {
      const background = process.env.ORCA_BACKGROUND_LAUNCH === '1'
      tool('/usr/bin/open', [
        ...(background ? ['-g', '-j', '--env', 'ORCA_BACKGROUND_LAUNCH=1'] : []),
        options.destination
      ])
    }
  } finally {
    if (mounted) {
      tool('/usr/bin/hdiutil', ['detach', mount])
      mounted = false
    }
    if (!mounted) {
      rmSync(scratch, { recursive: true, force: true })
    }
    if (stage && !existsSync(join(stage, 'Previous Orca.app'))) {
      rmSync(stage, { recursive: true, force: true })
    }
  }
}

if (isDirectInvocation(import.meta.url, process.argv[1])) {
  install(parseOptions(process.argv.slice(2))).catch((error) => {
    console.error(`Personal installation failed: ${error.message}`)
    process.exitCode = 1
  })
}
