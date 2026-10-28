import { mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProcessSync } from '@orca/process-host'
import { afterEach, beforeEach, expect, it } from 'vitest'
import {
  collectChangedFiles,
  computePassHash,
  changedCheckEnvironment,
  invalidatePassHash,
  readPassHash,
  writePassHash
} from './check-changed-pass-cache.mjs'
import {
  hasNewIncompleteEvidence,
  readDependencyEvidence
} from './check-changed-dependency-evidence.mjs'

let root
let base

function git(...args) {
  const result = runProcessSync({ program: 'git', args, cwd: root })
  expect(result.code, result.stderr).toBe(0)
  return result.stdout.trim()
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'check-changed-'))
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  git('config', 'core.autocrlf', 'false')
  writeFileSync(join(root, '.gitignore'), '.cache/\n')
  writeFileSync(join(root, 'tracked.ts'), 'export const a = 1\n')
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  git('add', '.')
  git('commit', '-qm', 'base')
  base = git('rev-parse', 'HEAD')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

it('keys the pass on every edit state and ignores its own cache file', () => {
  expect(collectChangedFiles(root, base)).toEqual([])

  writeFileSync(join(root, 'tracked.ts'), 'export const a = 2\n')
  const unstaged = computePassHash(root, base)
  writePassHash(root, unstaged)
  expect(readPassHash(root)).toBe(unstaged)
  expect(computePassHash(root, base)).toBe(unstaged)

  git('add', 'tracked.ts')
  expect(computePassHash(root, base)).toBe(unstaged)
  git('commit', '-qm', 'edit')
  expect(computePassHash(root, base)).toBe(unstaged)
  expect(collectChangedFiles(root, base)).toEqual(['tracked.ts'])

  writeFileSync(join(root, 'new.ts'), 'export const b = 1\n')
  const untracked = computePassHash(root, base)
  expect(untracked).not.toBe(unstaged)
  writeFileSync(join(root, 'new.ts'), 'export const b = 2\n')
  expect(computePassHash(root, base)).not.toBe(untracked)
  expect(collectChangedFiles(root, base)).toEqual(['new.ts', 'tracked.ts'])

  const beforeCommit = computePassHash(root, base)
  git('add', 'new.ts')
  git('commit', '-qm', 'add')
  expect(computePassHash(root, base)).toBe(beforeCommit)

  const beforeLockfile = computePassHash(root, base)
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 10\n')
  expect(computePassHash(root, base)).not.toBe(beforeLockfile)
})

it('limits worktree selection to edits after HEAD, including staged additions and deletions', () => {
  writeFileSync(join(root, 'committed.ts'), 'export const committed = 1\n')
  git('add', '.')
  git('commit', '-qm', 'branch change')
  expect(collectChangedFiles(root, base)).toEqual(['committed.ts'])
  expect(collectChangedFiles(root, 'HEAD')).toEqual([])

  rmSync(join(root, 'tracked.ts'))
  writeFileSync(join(root, 'staged.ts'), 'export const staged = 1\n')
  git('add', '.')
  writeFileSync(join(root, 'untracked.ts'), 'export const untracked = 1\n')
  expect(collectChangedFiles(root, 'HEAD')).toEqual(['staged.ts', 'tracked.ts', 'untracked.ts'])
})

it('keeps scope passes separate and invalidates iteration passes after a commit', () => {
  writeFileSync(join(root, 'tracked.ts'), 'export const a = 2\n')
  writeFileSync(join(root, 'committed.ts'), 'export const committed = 1\n')
  const branchHash = computePassHash(root, base)
  const iterationHash = computePassHash(root, base, 'worktree')
  expect(branchHash).not.toBe(iterationHash)
  writePassHash(root, iterationHash, 'worktree')
  expect(readPassHash(root)).toBeNull()
  writePassHash(root, branchHash)
  expect(readPassHash(root, 'worktree')).toBe(iterationHash)
  expect(readPassHash(root)).toBe(branchHash)

  const selected = collectChangedFiles(root, base)
  git('add', 'committed.ts')
  git('commit', '-qm', 'new dependency')
  expect(collectChangedFiles(root, base)).toEqual(selected)
  expect(computePassHash(root, base)).toBe(branchHash)
  expect(computePassHash(root, base, 'worktree')).not.toBe(iterationHash)
  expect(computePassHash(root, git('rev-parse', 'HEAD'), 'worktree')).not.toBe(iterationHash)
})

it('keys effective CI and build context while fixing inventory by scope', () => {
  const local = { CI: '', ORCA_BALANCE_UNIT_SHARDS: '0', ORCA_UNIT_INVENTORY: 'local' }
  const inherited = { ...local, ORCA_BALANCE_UNIT_SHARDS: '1', ORCA_UNIT_INVENTORY: 'ci' }
  expect(changedCheckEnvironment('branch', inherited)).toMatchObject({
    ORCA_BALANCE_UNIT_SHARDS: '0',
    ORCA_UNIT_INVENTORY: 'local'
  })
  expect(changedCheckEnvironment('worktree', local).ORCA_UNIT_INVENTORY).toBe('ci')
  const hash = computePassHash(root, base, 'branch', local)
  expect(computePassHash(root, base, 'branch', inherited)).toBe(hash)
  for (const context of [
    { CI: '1' },
    { ORCA_LAYOUT_OWNER: 'main' },
    { ORCA_SIDEBAR_INPUTS: 'main' },
    { ORCA_UNIT_MODULE_CACHE_PATH: '/other/cache' }
  ]) {
    expect(computePassHash(root, base, 'branch', { ...local, ...context })).not.toBe(hash)
  }
})

it('invalidates only the scope that is being rechecked', () => {
  writePassHash(root, 'branch pass')
  writePassHash(root, 'iteration pass', 'worktree')
  invalidatePassHash(root, 'branch', 'older pass')
  expect(readPassHash(root)).toBe('branch pass')
  invalidatePassHash(root)
  expect(readPassHash(root)).toBeNull()
  expect(readPassHash(root, 'worktree')).toBe('iteration pass')
})

it('selects materialized bytes when staged and unstaged changes cancel', () => {
  const original = 'export const a = 1\n'
  writeFileSync(join(root, 'tracked.ts'), 'export const a = 2\n')
  git('add', 'tracked.ts')
  writeFileSync(join(root, 'tracked.ts'), original)
  expect(git('status', '--short')).toContain('MM tracked.ts')
  expect(collectChangedFiles(root, base)).toEqual([])
})

function dependencyRecord(overrides = {}) {
  return {
    version: 2,
    projects: {
      unit: {
        modules: ['tracked.ts', 'consumer.test.ts'],
        files: { 'consumer.test.ts': [0, 1] },
        signatures: { 'consumer.test.ts': 'source signature' },
        contexts: { 'consumer.test.ts': 'context signature' },
        incomplete: [],
        ...overrides
      }
    }
  }
}

it('attests semantic dependency evidence and preserves the other scope when records strengthen', () => {
  const file = join(root, '.cache/dependencies.json')
  mkdirSync(join(root, '.cache'))
  const write = (record) => writeFileSync(file, JSON.stringify(record))
  write(dependencyRecord())
  const evidence = readDependencyEvidence(file)
  expect(writePassHash(root, 'tested sources', 'worktree', evidence)).toBe(true)
  writePassHash(root, 'docs only branch')
  write(
    dependencyRecord({
      modules: ['unused.ts', 'consumer.test.ts', 'tracked.ts'],
      files: { 'consumer.test.ts': [1, 2, 1] }
    })
  )
  expect(readPassHash(root, 'worktree')).toBe('tested sources')
  const incomplete = dependencyRecord({ incomplete: ['consumer.test.ts'] })
  write(incomplete)
  expect(readPassHash(root, 'worktree')).toBeNull()
  expect(hasNewIncompleteEvidence(evidence, readDependencyEvidence(file))).toBe(true)
  expect(writePassHash(root, 'old evidence', 'worktree', evidence)).toBe(false)
  expect(readPassHash(root)).toBe('docs only branch')
  expect(
    JSON.parse(readFileSync(join(root, '.cache/check-changed.json'), 'utf8')).passes.worktree.hash
  ).toBe('tested sources')
})

it('accepts passing record updates in one invocation and distinguishes stable incomplete evidence', () => {
  const file = join(root, '.cache/dependencies.json')
  mkdirSync(join(root, '.cache'))
  writeFileSync(file, JSON.stringify(dependencyRecord({ incomplete: ['consumer.test.ts'] })))
  const before = readDependencyEvidence(file)
  expect(hasNewIncompleteEvidence(before, readDependencyEvidence(file))).toBe(false)
  writeFileSync(
    file,
    JSON.stringify(dependencyRecord({ modules: ['other.ts', 'consumer.test.ts'] }))
  )
  const passing = readDependencyEvidence(file)
  expect(passing.hash).not.toBe(before.hash)
  expect(hasNewIncompleteEvidence(before, passing)).toBe(false)
  expect(writePassHash(root, 'passed once', 'branch', passing)).toBe(true)
  expect(readPassHash(root)).toBe('passed once')
  writeFileSync(
    file,
    JSON.stringify(dependencyRecord({ contexts: { 'consumer.test.ts': 'new context' } }))
  )
  expect(readPassHash(root)).toBeNull()
})

it('refuses malformed, unsupported, oversized, and removed dependency evidence', () => {
  const file = join(root, '.cache/dependencies.json')
  mkdirSync(join(root, '.cache'))
  writeFileSync(file, JSON.stringify(dependencyRecord()))
  const evidence = readDependencyEvidence(file)
  for (const contents of [
    '{',
    JSON.stringify({ version: 1, projects: {} }),
    JSON.stringify(dependencyRecord({ files: { 'consumer.test.ts': [99] } }))
  ]) {
    writeFileSync(file, contents)
    expect(readDependencyEvidence(file)).toBeNull()
    expect(writePassHash(root, 'unverifiable', 'branch', evidence)).toBe(false)
  }
  truncateSync(file, 32 * 1024 * 1024 + 1)
  expect(readDependencyEvidence(file)).toBeNull()
  writeFileSync(file, JSON.stringify(dependencyRecord()))
  writePassHash(root, 'before clearing', 'branch', evidence)
  rmSync(file)
  expect(readPassHash(root)).toBeNull()
})

it.skipIf(process.platform === 'win32')(
  'rejects FIFO evidence without blocking cache lookup',
  () => {
    const file = join(root, 'dependencies.json')
    const fifo = runProcessSync({ program: 'mkfifo', args: [file], cwd: root })
    expect(fifo.code, fifo.stderr).toBe(0)
    const result = runProcessSync({
      program: process.env.ORCA_TEST_NODE_EXECUTABLE ?? process.execPath,
      args: [
        '--input-type=module',
        '-e',
        `
      import { readDependencyEvidence } from ${JSON.stringify(new URL('./check-changed-dependency-evidence.mjs', import.meta.url).href)}
      if (readDependencyEvidence(${JSON.stringify(file)}) !== null) process.exitCode = 1
    `
      ],
      cwd: root,
      env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1' },
      timeoutMs: 1_000
    })
    expect(result.timedOut).toBe(false)
    expect(result.code, result.stderr).toBe(0)
  }
)
