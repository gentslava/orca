import { createHash } from 'node:crypto'
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEPENDENCY_PATH_PREFIX = 'check:changed dependency path: '
const MAX_EVIDENCE_BYTES = 32 * 1024 * 1024

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const dictionary = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

function projectEvidence(name, project, incomplete) {
  if (
    !dictionary(project) ||
    !Array.isArray(project.modules) ||
    !project.modules.every((file) => typeof file === 'string') ||
    !dictionary(project.files) ||
    !dictionary(project.signatures) ||
    !dictionary(project.contexts) ||
    !Array.isArray(project.incomplete) ||
    !project.incomplete.every(
      (file) => typeof file === 'string' && Object.hasOwn(project.files, file)
    )
  ) {
    throw new Error('Invalid dependency project')
  }
  const modules = (indices) => {
    if (
      !Array.isArray(indices) ||
      !indices.every(
        (index) => Number.isInteger(index) && index >= 0 && index < project.modules.length
      )
    ) {
      throw new Error('Invalid dependency indices')
    }
    return [...new Set(indices.map((index) => project.modules[index]))].sort()
  }
  const globalSetup = project.globalSetup === undefined ? null : modules(project.globalSetup)
  const partial = new Set(project.incomplete)
  const files = Object.keys(project.files)
    .sort()
    .map((file) => {
      const signature = project.signatures[file] ?? null
      const context = project.contexts[file] ?? null
      if ([signature, context].some((value) => value !== null && typeof value !== 'string')) {
        throw new Error('Invalid dependency signature')
      }
      const record = [file, modules(project.files[file]), signature, context, partial.has(file)]
      if (partial.has(file)) {
        incomplete.push([JSON.stringify([name, file]), digest([globalSetup, record])])
      }
      return record
    })
  return [name, globalSetup, files]
}

// Attest selection evidence, not module numbering, unused interned modules, or file timestamps.
export function readDependencyEvidence(file) {
  if (file === null) {
    return { path: null, hash: 'disabled', incomplete: [] }
  }
  if (typeof file !== 'string' || !path.isAbsolute(file)) {
    return null
  }
  let descriptor
  try {
    // A FIFO must not block before fstat can reject it.
    descriptor = openSync(
      file,
      constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NONBLOCK)
    )
    const before = fstatSync(descriptor)
    if (!before.isFile() || before.size > MAX_EVIDENCE_BYTES) {
      return null
    }
    const bytes = Buffer.alloc(before.size)
    let offset = 0
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset)
      if (!count) {
        return null
      }
      offset += count
    }
    const after = fstatSync(descriptor)
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    ) {
      return null
    }
    const cache = JSON.parse(bytes.toString('utf8'))
    if (cache.version !== 2 || !dictionary(cache.projects)) {
      return null
    }
    const incomplete = []
    const projects = Object.keys(cache.projects)
      .sort()
      .map((name) => projectEvidence(name, cache.projects[name], incomplete))
    return { path: file, hash: digest(projects), incomplete }
  } catch (error) {
    return descriptor === undefined && error.code === 'ENOENT'
      ? { path: file, hash: digest([]), incomplete: [] }
      : null
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor)
    }
  }
}

export function hasNewIncompleteEvidence(before, after) {
  const previous = new Map(before?.incomplete ?? [])
  return Boolean(after?.incomplete.some(([file, hash]) => previous.get(file) !== hash))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const require = createRequire(path.join(process.cwd(), 'package.json'))
  const { resolveConfig } = await import(pathToFileURL(require.resolve('vitest/node')).href)
  const config = await resolveConfig({ config: 'config/vitest.config.ts', watch: false })
  const file =
    config.test.cache && config.test.experimental.recordDependencies
      ? path.join(config.cacheDir, 'dependencies.json')
      : null
  console.log(`${DEPENDENCY_PATH_PREFIX}${JSON.stringify(file)}`)
}
