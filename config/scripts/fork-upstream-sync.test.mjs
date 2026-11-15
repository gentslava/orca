import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import {
  mergeCandidate,
  planSync,
  previewIdentity,
  promoteCandidate,
  recoverIntegration,
  requireForkMaster,
  sealCandidate
} from './fork-upstream-sync.mjs'
import { verifyStagedArchives } from './fork-upstream-archives.mjs'
import { withForkSyncSsh } from './fork-upstream-ssh.mjs'

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

function sshFixture(f) {
  const bin = join(f.root, "ssh bin's directory")
  const log = join(f.root, 'ssh.jsonl')
  mkdirSync(bin)
  const ssh = join(bin, 'ssh')
  writeFileSync(
    ssh,
    `#!/usr/bin/env node
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const args = process.argv.slice(2)
const key = args[args.indexOf('-i') + 1]
const knownHosts = JSON.parse(args.find(value => value.startsWith('UserKnownHostsFile=')).slice('UserKnownHostsFile='.length))
fs.appendFileSync(process.env.FORK_TEST_SSH_LOG, JSON.stringify({
  args, key, mode: fs.statSync(key).mode & 0o777,
  knownHosts: fs.readFileSync(knownHosts, 'utf8'),
  credentials: ['FORK_SYNC_DEPLOY_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'SSH_AUTH_SOCK'].filter(name => name in process.env),
  gitConfig: Object.keys(process.env).filter(name => /^GIT_CONFIG_(COUNT|KEY_|VALUE_)/.test(name))
}) + '\\n')
const command = /^(git-upload-pack|git-receive-pack) 'gentslava\\/orca.git'$/.exec(args.at(-1))
if (!command || !args.includes('git@github.com')) process.exit(98)
const result = spawnSync(command[1], [process.env.FORK_TEST_REMOTE], { stdio: 'inherit' })
process.exit(result.status ?? 99)
`
  )
  chmodSync(ssh, 0o755)
  return {
    ...process.env,
    RUNNER_TEMP: f.root,
    PATH: `${bin}:${process.env.PATH}`,
    FORK_TEST_SSH_LOG: log,
    FORK_TEST_REMOTE: f.fork,
    FORK_SYNC_DEPLOY_KEY: 'test-only credential, no real private key',
    GITHUB_TOKEN: 'rest-token-must-not-reach-git',
    GH_TOKEN: 'other-token-must-not-reach-git',
    SSH_AUTH_SOCK: 'inherited-agent-must-not-be-used',
    GIT_SSH_COMMAND: 'inherited-command-must-not-be-used',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'url.https://unsafe.invalid/.insteadOf',
    GIT_CONFIG_VALUE_0: 'git@github.com:'
  }
}

function sshCalls(f) {
  return readFileSync(join(f.root, 'ssh.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
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

  it.skipIf(process.platform === 'win32')(
    'uses only the dedicated SSH identity for the fork URL and cleans it after promotion',
    async () => {
      const f = fixture()
      const candidate = mergeCandidate(f.checkout, f.plan, f.upstream)
      seal(f, candidate)
      const writer = join(f.root, 'trusted-writer')
      git(f.root, 'clone', '--branch', 'master', f.fork, writer)
      const before = git(writer, 'rev-parse', 'HEAD')
      const result = await withForkSyncSsh(sshFixture(f), (env) =>
        promoteCandidate(writer, f.plan, candidate, f.directory, { env })
      )
      expect(result).toBe('promoted')
      expect(git(f.fork, 'rev-parse', 'master')).toBe(candidate.candidateSha)
      expect(git(writer, 'rev-parse', 'HEAD')).toBe(before)
      const calls = sshCalls(f)
      expect(calls.map((call) => call.args.at(-1))).toEqual([
        "git-upload-pack 'gentslava/orca.git'",
        "git-receive-pack 'gentslava/orca.git'"
      ])
      for (const call of calls) {
        expect(call.credentials).toEqual([])
        expect(call.gitConfig).toEqual([])
        expect(call.mode).toBe(0o600)
        expect(call.args).toEqual(
          expect.arrayContaining([
            '-F',
            '/dev/null',
            'IdentitiesOnly=yes',
            'IdentityAgent=none',
            'BatchMode=yes',
            'StrictHostKeyChecking=yes',
            'GlobalKnownHostsFile=/dev/null',
            'UpdateHostKeys=no'
          ])
        )
        expect(call.knownHosts).toBe(
          readFileSync(new URL('../fork-upstream-github-known-hosts', import.meta.url), 'utf8')
        )
        expect(existsSync(call.key)).toBe(false)
      }
      expect(readdirSync(f.root).filter((name) => name.startsWith('orca-fork-sync-ssh-'))).toEqual(
        []
      )
    }
  )

  it('fails without the dedicated key even when a REST token is available, and removes it on async failure', async () => {
    const run = vi.fn()
    await expect(withForkSyncSsh({ GITHUB_TOKEN: 'rest-only' }, run)).rejects.toThrow(
      /FORK_SYNC_DEPLOY_KEY is required/
    )
    expect(run).not.toHaveBeenCalled()
    const root = mkdtempSync(join(tmpdir(), "orca-fork-key's-test-"))
    roots.push(root)
    await expect(
      withForkSyncSsh({ RUNNER_TEMP: root, FORK_SYNC_DEPLOY_KEY: 'dummy' }, async (env) => {
        expect(env.GIT_SSH_COMMAND).toContain("'\\''")
        const directory = join(root, readdirSync(root)[0])
        if (process.platform !== 'win32') {
          expect(statSync(directory).mode & 0o777).toBe(0o700)
          expect(statSync(join(directory, 'identity')).mode & 0o777).toBe(0o600)
        }
        throw new Error('rejected operation')
      })
    ).rejects.toThrow('rejected operation')
    expect(readdirSync(root)).toEqual([])
  })

  it.skipIf(process.platform === 'win32')(
    'uses SSH for recovery mirror writes and the REST token only for PR creation/reuse',
    async () => {
      const f = fixture({ conflict: true })
      const request = vi.fn(async (_url, options) => ({
        ok: true,
        json: async () =>
          options.method === 'GET' ? [] : { html_url: 'https://github.com/gentslava/orca/pull/1' }
      }))
      const env = sshFixture(f)
      const recover = () =>
        withForkSyncSsh(env, (gitEnv) =>
          recoverIntegration(f.checkout, f.plan, {
            upstreamUrl: f.upstream,
            env: gitEnv,
            token: env.GITHUB_TOKEN,
            request
          })
        )
      await recover()
      expect(git(f.fork, 'rev-parse', 'gentslava/fork-upstream-main')).toBe(f.plan.upstreamSha)
      expect(git(f.fork, 'rev-parse', 'master')).toBe(f.plan.forkSha)
      const [url, options] = request.mock.calls[1]
      expect(url).toBe('https://api.github.com/repos/gentslava/orca/pulls')
      expect(options.method).toBe('POST')
      expect(options.headers.Authorization).toBe(`Bearer ${env.GITHUB_TOKEN}`)
      expect(JSON.parse(options.body)).toMatchObject({
        head: 'gentslava/fork-upstream-main',
        base: 'master'
      })
      request.mockImplementation(async (_url, options) => ({
        ok: true,
        json: async () =>
          options.method === 'GET'
            ? [{ number: 1 }]
            : { html_url: 'https://github.com/gentslava/orca/pull/1' }
      }))
      await recover()
      expect(request.mock.calls[3][0]).toBe('https://api.github.com/repos/gentslava/orca/pulls/1')
      expect(request.mock.calls[3][1].method).toBe('PATCH')
      for (const call of sshCalls(f)) {
        expect(call.credentials).toEqual([])
        expect(existsSync(call.key)).toBe(false)
      }
      git(f.fork, 'update-ref', 'refs/heads/gentslava/fork-upstream-main', f.plan.forkSha)
      request.mockClear()
      await expect(recover()).rejects.toThrow()
      expect(git(f.fork, 'rev-parse', 'gentslava/fork-upstream-main')).toBe(f.plan.forkSha)
      expect(request).not.toHaveBeenCalled()
      await expect(
        withForkSyncSsh(env, (gitEnv) =>
          recoverIntegration(f.checkout, f.plan, {
            upstreamUrl: f.upstream,
            env: gitEnv,
            token: '',
            request
          })
        )
      ).rejects.toThrow(/GITHUB_TOKEN with pull-requests: write/)
      expect(readdirSync(f.root).filter((name) => name.startsWith('orca-fork-sync-ssh-'))).toEqual(
        []
      )
    }
  )

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

describe('fork sync workflow credential boundary', () => {
  it('grants no GitHub contents writes and exposes the key only after trusted writer checkouts', () => {
    const workflow = parse(
      readFileSync(
        new URL('../../.github/workflows/fork-preview-macos-arm64.yml', import.meta.url),
        'utf8'
      )
    )
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.env).not.toHaveProperty('FORK_SYNC_DEPLOY_KEY')
    for (const [name, job] of Object.entries(workflow.jobs)) {
      expect((job.permissions ?? workflow.permissions).contents).toBe('read')
      expect(job.env ?? {}).not.toHaveProperty('FORK_SYNC_DEPLOY_KEY')
      const writers = job.steps.filter((step) => step.env?.FORK_SYNC_DEPLOY_KEY)
      if (!['promote', 'integration-pr'].includes(name)) {
        expect(JSON.stringify(job)).not.toContain('FORK_SYNC_DEPLOY_KEY')
        expect(job.permissions?.['pull-requests']).toBeUndefined()
        continue
      }
      expect(writers).toHaveLength(1)
      const writer = writers[0]
      expect(writer.env.FORK_SYNC_DEPLOY_KEY).toBe('${{ secrets.FORK_SYNC_DEPLOY_KEY }}')
      const checkout = job.steps.find((step) => step.uses?.startsWith('actions/checkout@'))
      expect(checkout.with).toMatchObject({
        ref: '${{ github.sha }}',
        'persist-credentials': false
      })
      expect(job.steps.indexOf(checkout)).toBeLessThan(job.steps.indexOf(writer))
      const cleanup = job.steps.find((step) =>
        step.run?.includes('rm -rf -- "$RUNNER_TEMP"/orca-fork-sync-ssh-*')
      )
      expect(cleanup.if).toBe('always()')
      expect(job.steps.indexOf(cleanup)).toBeGreaterThan(job.steps.indexOf(writer))
      expect(writer.env.GITHUB_TOKEN).toBe(
        name === 'integration-pr' ? '${{ github.token }}' : undefined
      )
      expect(job.permissions?.['pull-requests']).toBe(
        name === 'integration-pr' ? 'write' : undefined
      )
    }
  })
})
