import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from './composition.mjs'
import { controlFingerprint, preparePromotion, promoteBranches } from './promotion.mjs'

function commit(cwd, path, text) {
  mkdirSync(join(cwd, path, '..'), { recursive: true })
  writeFileSync(join(cwd, path), text)
  git(cwd, ['add', '--', path])
  git(cwd, ['commit', '-m', `Change ${path}`])
  return git(cwd, ['rev-parse', 'HEAD'])
}

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'personal-promotion-'))
  const cwd = join(root, 'source')
  const remote = join(root, 'fork.git')
  try {
    mkdirSync(cwd)
    git(cwd, ['init', '-b', 'main'])
    const main = commit(cwd, 'application', 'old upstream\n')
    git(cwd, ['init', '--bare', remote])
    git(cwd, ['push', remote, `${main}:refs/heads/main`])
    git(cwd, ['checkout', '-b', 'master'])
    commit(cwd, 'application', 'historical application\n')
    commit(cwd, 'retired-feature', 'not selected\n')
    commit(cwd, 'AGENTS.md', 'fork agent guidance\n')
    commit(cwd, '.github/workflows/personal-build.yml', 'trusted workflow\n')
    const configuration = commit(cwd, 'config/fork-build/selection.json', '{"selected":true}\n')
    git(cwd, ['push', remote, `${configuration}:refs/heads/master`])
    git(cwd, ['checkout', '--detach', main])
    const intermediate = commit(cwd, 'upstream-addition', 'first upstream change\n')
    const upstream = commit(cwd, 'application', 'fresh upstream\n')
    const source = commit(cwd, 'selected-feature', 'required PR\n')
    const plan = {
      repository: 'stablyai/orca',
      configuration,
      upstream,
      runUrl: 'https://github.com/gentslava/orca/actions/runs/1',
      result: {
        publishable: true,
        upstream,
        commit: source,
        tree: git(cwd, ['rev-parse', 'HEAD^{tree}'])
      }
    }
    const candidate = preparePromotion(cwd, plan)
    git(cwd, ['reset', '--hard', source])
    return run({ root, cwd, remote, main, intermediate, plan, candidate })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('promotes the exact built application, preserves control and ancestry, and atomically mirrors main', () =>
  fixture((f) => {
    const { cwd, plan, candidate } = f
    assert.equal(git(cwd, ['show', `${candidate.commit}:application`]), 'fresh upstream')
    assert.equal(git(cwd, ['show', `${candidate.commit}:selected-feature`]), 'required PR')
    assert.equal(git(cwd, ['show', `${candidate.commit}:AGENTS.md`]), 'fork agent guidance')
    assert.throws(() => git(cwd, ['show', `${candidate.commit}:retired-feature`]))
    assert.deepEqual(git(cwd, ['rev-list', '--parents', '-1', candidate.commit]).split(' '), [
      candidate.commit,
      plan.configuration,
      plan.result.commit
    ])
    assert.equal(
      controlFingerprint(cwd, candidate.commit),
      controlFingerprint(cwd, plan.configuration)
    )
    assert.equal(controlFingerprint(cwd, plan.result.commit), controlFingerprint(cwd, f.main))
    const result = promoteBranches(cwd, plan, candidate, { forkUrl: f.remote })
    assert.equal(result.status, 'promoted')
    assert.equal(git(f.remote, ['rev-parse', 'master']), candidate.commit)
    assert.equal(git(f.remote, ['rev-parse', 'main']), plan.upstream)
  }))

test('a concurrent master update preserves both remote branches', () =>
  fixture((f) => {
    git(f.cwd, ['checkout', '--detach', f.plan.configuration])
    const human = commit(f.cwd, 'human-change', 'keep\n')
    git(f.cwd, ['push', f.remote, `${human}:refs/heads/master`])
    assert.throws(
      () => promoteBranches(f.cwd, f.plan, f.candidate, { forkUrl: f.remote }),
      /Master moved/
    )
    assert.equal(git(f.remote, ['rev-parse', 'master']), human)
    assert.equal(git(f.remote, ['rev-parse', 'main']), f.main)
  }))

test('a newer main cannot be rewound even when master could advance', () =>
  fixture((f) => {
    git(f.cwd, ['checkout', '--detach', f.plan.upstream])
    const newer = commit(f.cwd, 'later-upstream', 'keep\n')
    git(f.cwd, ['push', f.remote, `${newer}:refs/heads/main`])
    assert.throws(
      () => promoteBranches(f.cwd, f.plan, f.candidate, { forkUrl: f.remote }),
      /rewind/
    )
    assert.equal(git(f.remote, ['rev-parse', 'master']), f.plan.configuration)
    assert.equal(git(f.remote, ['rev-parse', 'main']), newer)
  }))

test(
  'a server rejection of either update leaves both branches unchanged',
  { skip: process.platform === 'win32' },
  () =>
    fixture((f) => {
      const hook = join(f.remote, 'hooks', 'update')
      writeFileSync(hook, '#!/bin/sh\nif test "$1" = refs/heads/master; then exit 1; fi\n')
      chmodSync(hook, 0o755)
      assert.throws(() => promoteBranches(f.cwd, f.plan, f.candidate, { forkUrl: f.remote }))
      assert.equal(git(f.remote, ['rev-parse', 'master']), f.plan.configuration)
      assert.equal(git(f.remote, ['rev-parse', 'main']), f.main)
    })
)

test(
  'push advertisement rejects even a fast-forward-compatible main race',
  { skip: process.platform === 'win32' },
  () =>
    fixture((f) => {
      git(f.cwd, ['push', f.remote, `${f.intermediate}:refs/heads/race-prepared`])
      const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
      const bin = join(f.root, 'bin')
      mkdirSync(bin)
      const wrapper = join(bin, 'git')
      writeFileSync(
        wrapper,
        '#!/bin/sh\nset -eu\ncase " $* " in\n  *" push "*) "$PROMOTION_REAL_GIT" --git-dir="$PROMOTION_REMOTE" update-ref refs/heads/main "$PROMOTION_ADVANCE" ;;\nesac\nexec "$PROMOTION_REAL_GIT" "$@"\n'
      )
      chmodSync(wrapper, 0o755)
      const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        PROMOTION_REAL_GIT: realGit,
        PROMOTION_REMOTE: f.remote,
        PROMOTION_ADVANCE: f.intermediate
      }
      assert.throws(() => promoteBranches(f.cwd, f.plan, f.candidate, { forkUrl: f.remote, env }))
      assert.equal(git(f.remote, ['rev-parse', 'master']), f.plan.configuration)
      assert.equal(git(f.remote, ['rev-parse', 'main']), f.intermediate)
    })
)

test('audit, failed, reused, dirty and mismatched-source plans never become promotion candidates', () =>
  fixture((f) => {
    for (const override of [
      { auditOnly: true },
      { reuse: true },
      { error: 'failed' },
      { result: { ...f.plan.result, publishable: false } },
      { result: { ...f.plan.result, tree: f.main } }
    ]) {
      assert.throws(() => preparePromotion(f.cwd, { ...f.plan, ...override }))
    }
    writeFileSync(join(f.cwd, 'application'), 'unverified edit\n')
    assert.throws(() => preparePromotion(f.cwd, f.plan), /differs from the built source/)
    assert.equal(git(f.remote, ['rev-parse', 'master']), f.plan.configuration)
    assert.equal(git(f.remote, ['rev-parse', 'main']), f.main)
  }))
