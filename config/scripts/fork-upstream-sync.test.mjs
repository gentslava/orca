import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mergeCandidate,
  planSync,
  previewIdentity,
  promoteCandidate,
  requireForkMaster,
  sealCandidate
} from './fork-upstream-sync.mjs'
import { verifyStagedArchives } from './fork-upstream-archives.mjs'

// Archive extraction has real signed-bundle coverage in fork-upstream-archives.test.mjs.
vi.mock('./fork-upstream-archives.mjs', () => ({ verifyStagedArchives: vi.fn() }))

const roots = []
afterEach(() => {
  vi.mocked(verifyStagedArchives).mockReset()
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

function commit(cwd, file, value) {
  writeFileSync(join(cwd, file), value)
  git(cwd, 'add', file)
  git(cwd, 'commit', '-qm', `change ${file}`)
  return git(cwd, 'rev-parse', 'HEAD')
}

function fixture({ changed = true, conflict = false, forkChanged = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'orca-fork-sync-test-'))
  roots.push(root)
  const upstream = join(root, 'upstream')
  const fork = join(root, 'fork.git')
  const checkout = join(root, 'checkout')
  mkdirSync(upstream)
  git(upstream, 'init', '-b', 'main')
  git(upstream, 'config', 'user.name', 'Fork sync test')
  git(upstream, 'config', 'user.email', 'fork-sync@example.invalid')
  commit(upstream, 'package.json', '{"version":"1.2.3"}')
  commit(upstream, 'feature.txt', 'base\n')
  git(root, 'clone', '--bare', upstream, fork)
  git(root, 'clone', fork, checkout)
  git(checkout, 'config', 'user.name', 'Fork sync test')
  git(checkout, 'config', 'user.email', 'fork-sync@example.invalid')
  git(checkout, 'checkout', '-b', 'master')
  if (forkChanged) {
    commit(checkout, conflict ? 'feature.txt' : 'fork.txt', 'fork feature\n')
  }
  git(checkout, 'push', 'origin', 'master')
  if (changed) {
    commit(upstream, 'feature.txt', 'upstream feature\n')
  }
  const plan = planSync(checkout, { forkUrl: fork, upstreamUrl: upstream, event: 'schedule' })
  const directory = join(root, 'candidate')
  const archives = join(root, 'archives')
  mkdirSync(directory)
  mkdirSync(archives)
  return { root, upstream, fork, checkout, directory, archives, plan }
}

function seal(f, candidate) {
  vi.mocked(verifyStagedArchives).mockReturnValue({ schemaVersion: 1, archives: [] })
  sealCandidate(f.checkout, candidate, f.directory, f.archives)
  expect(verifyStagedArchives).toHaveBeenCalledWith(f.archives, {
    ...candidate,
    commit: candidate.candidateSha
  })
}

describe('fork upstream integration against real repositories', () => {
  it('pins economical scheduled DMGs and requires both formats when manually requested', () => {
    const f = fixture()
    expect(
      planSync(f.checkout, {
        forkUrl: f.fork,
        upstreamUrl: f.upstream,
        event: 'schedule',
        formats: 'both'
      }).formats
    ).toBe('dmg')
    const plan = planSync(f.checkout, {
      forkUrl: f.fork,
      upstreamUrl: f.upstream,
      event: 'workflow_dispatch',
      formats: 'both'
    })
    expect(plan.formats).toBe('both')
    const candidate = mergeCandidate(f.checkout, plan, f.upstream)
    vi.mocked(verifyStagedArchives).mockImplementationOnce(() => {
      throw new Error('Archive metadata does not describe all requested candidate formats')
    })
    expect(() => sealCandidate(f.checkout, candidate, f.directory, f.archives)).toThrow(
      /all requested/
    )
    seal(f, candidate)
  })

  it('skips an unchanged scheduled build and still permits an explicit rebuild', () => {
    const f = fixture({ changed: false })
    expect(f.plan.build).toBe(false)
    expect(
      planSync(f.checkout, { forkUrl: f.fork, upstreamUrl: f.upstream, event: 'workflow_dispatch' })
        .build
    ).toBe(true)
    expect(git(f.fork, 'rev-parse', 'master')).toBe(f.plan.forkSha)
  })

  it('merges the pinned upstream even after main advances, preserving fork changes and actual source identity', () => {
    const f = fixture()
    const later = commit(f.upstream, 'later.txt', 'not planned\n')
    const candidate = mergeCandidate(f.checkout, f.plan, f.upstream)
    expect(git(f.checkout, 'rev-list', '--parents', '-1', 'HEAD').split(' ')).toEqual([
      candidate.candidateSha,
      f.plan.forkSha,
      f.plan.upstreamSha
    ])
    expect(readFileSync(join(f.checkout, 'fork.txt'), 'utf8')).toBe('fork feature\n')
    expect(() => git(f.checkout, 'merge-base', '--is-ancestor', later, 'HEAD')).toThrow()
    const identity = previewIdentity(f.checkout)
    expect(identity.commit).toBe(candidate.candidateSha)
    expect(identity.version).toMatch(
      new RegExp(`^1\\.2\\.3-local\\.forkpreview\\.\\d+\\.${candidate.candidateSha.slice(0, 12)}$`)
    )
    expect(git(f.fork, 'rev-parse', 'master')).toBe(f.plan.forkSha)
  })

  it('stops on conflicts with unresolved files available for diagnostics and last-good master intact', () => {
    const f = fixture({ conflict: true })
    expect(() => mergeCandidate(f.checkout, f.plan, f.upstream)).toThrow()
    expect(git(f.checkout, 'diff', '--name-only', '--diff-filter=U')).toBe('feature.txt')
    expect(git(f.checkout, 'rev-parse', 'HEAD')).toBe(f.plan.forkSha)
    expect(git(f.fork, 'rev-parse', 'master')).toBe(f.plan.forkSha)
  })

  it('refuses changed build sources and mismatched archive source metadata', () => {
    const f = fixture()
    const candidate = mergeCandidate(f.checkout, f.plan, f.upstream)
    writeFileSync(join(f.checkout, 'fork.txt'), 'unexpected fixup\n')
    expect(() => seal(f, candidate)).toThrow(/changed the tested source/)
    git(f.checkout, 'restore', 'fork.txt')
    vi.mocked(verifyStagedArchives).mockImplementationOnce(() => {
      throw new Error('Archive metadata differs from measured source proof')
    })
    expect(() => sealCandidate(f.checkout, candidate, f.directory, f.archives)).toThrow(/metadata/)
    expect(git(f.fork, 'rev-parse', 'master')).toBe(f.plan.forkSha)
  })

  it('promotes exactly the sealed candidate via a normal fast-forward push from another checkout', () => {
    const f = fixture()
    const candidate = mergeCandidate(f.checkout, f.plan, f.upstream)
    seal(f, candidate)
    const writer = join(f.root, 'writer')
    git(f.root, 'clone', '--branch', 'master', f.fork, writer)
    expect(promoteCandidate(writer, f.plan, candidate, f.directory, { forkUrl: f.fork })).toBe(
      'promoted'
    )
    expect(git(f.fork, 'rev-parse', 'master')).toBe(candidate.candidateSha)
  })

  it('rejects a master advance during the build without overwriting it', () => {
    const f = fixture()
    const candidate = mergeCandidate(f.checkout, f.plan, f.upstream)
    seal(f, candidate)
    git(f.checkout, 'checkout', '--detach', f.plan.forkSha)
    const newer = commit(f.checkout, 'human.txt', 'new human change\n')
    git(f.checkout, 'push', f.fork, `${newer}:refs/heads/master`)
    expect(() =>
      promoteCandidate(f.checkout, f.plan, candidate, f.directory, { forkUrl: f.fork })
    ).toThrow(/Master moved/)
    expect(git(f.fork, 'rev-parse', 'master')).toBe(newer)
  })

  it.skipIf(process.platform === 'win32')(
    'rejects even a fast-forward-compatible master race between fetch and push advertisement',
    () => {
      const f = fixture({ forkChanged: false })
      const candidate = mergeCandidate(f.checkout, f.plan, f.upstream)
      seal(f, candidate)
      const bin = join(f.root, 'bin')
      git(f.checkout, 'push', f.fork, `${f.plan.upstreamSha}:refs/heads/race-prepared`)
      mkdirSync(bin)
      const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
      const wrapper = join(bin, 'git')
      writeFileSync(
        wrapper,
        `#!/bin/sh\nset -eu\ncase " $* " in\n  *" push "*) "$FORK_TEST_GIT" --git-dir="$FORK_TEST_REMOTE" update-ref refs/heads/master "$FORK_TEST_ADVANCE" ;;\nesac\nexec "$FORK_TEST_GIT" "$@"\n`
      )
      chmodSync(wrapper, 0o755)
      const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        FORK_TEST_GIT: realGit,
        FORK_TEST_REMOTE: f.fork,
        FORK_TEST_ADVANCE: f.plan.upstreamSha
      }
      // Both SHAs are candidate ancestors: an unguarded ordinary push would overwrite the new master.
      expect(() =>
        promoteCandidate(f.checkout, f.plan, candidate, f.directory, { forkUrl: f.fork, env })
      ).toThrow()
      expect(git(f.fork, 'rev-parse', 'master')).toBe(f.plan.upstreamSha)
    }
  )

  it('allows a manual unchanged rebuild without manufacturing a commit or empty bundle', () => {
    const f = fixture({ changed: false })
    const plan = { ...f.plan, event: 'workflow_dispatch', build: true }
    const candidate = mergeCandidate(f.checkout, plan, f.upstream)
    seal(f, candidate)
    expect(candidate.candidateSha).toBe(plan.forkSha)
    expect(promoteCandidate(f.checkout, plan, candidate, f.directory, { forkUrl: f.fork })).toBe(
      'unchanged'
    )
  })

  it('rejects upstream repositories, non-master refs and recursive triggers before any write', () => {
    const valid = {
      GITHUB_REPOSITORY: 'gentslava/orca',
      GITHUB_REF: 'refs/heads/master',
      GITHUB_EVENT_NAME: 'schedule'
    }
    expect(() => requireForkMaster(valid)).not.toThrow()
    for (const override of [
      { GITHUB_REPOSITORY: 'stablyai/orca' },
      { GITHUB_REF: 'refs/heads/main' },
      { GITHUB_EVENT_NAME: 'push' },
      { GITHUB_EVENT_NAME: 'pull_request' }
    ]) {
      expect(() => requireForkMaster({ ...valid, ...override })).toThrow(/only operates/)
    }
  })
})
