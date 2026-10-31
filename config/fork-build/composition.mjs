import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export function git(cwd, args, extra = {}) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Orca Plus',
      GIT_AUTHOR_EMAIL: 'plus@users.noreply.github.com',
      GIT_COMMITTER_NAME: 'Orca Plus',
      GIT_COMMITTER_EMAIL: 'plus@users.noreply.github.com',
      ...extra
    }
  }).trim()
}

export function isAncestor(cwd, ancestor, head) {
  if (!/^[a-f0-9]{40}$/.test(ancestor || '')) {
    return false
  }
  try {
    git(cwd, ['merge-base', '--is-ancestor', ancestor, head])
    return true
  } catch (error) {
    if (error.status === 1) {
      return false
    }
    throw error
  }
}

export function assertFrozenHead(cwd, number, expected) {
  if (git(cwd, ['rev-parse', `refs/personal/pr-${number}`]) !== expected) {
    throw new Error(`PR #${number} moved after snapshot; rerun planning`)
  }
}

function directConflicts(cwd, upstream, sha) {
  const directory = mkdtempSync(join(tmpdir(), 'plus-conflict-'))
  try {
    git(directory, ['clone', '--shared', '--no-checkout', cwd, '.'])
    git(directory, ['checkout', '--detach', upstream])
    try {
      git(directory, ['merge', '--no-commit', '--no-ff', sha])
      return false
    } catch {
      if (!git(directory, ['diff', '--name-only', '--diff-filter=U'])) {
        throw new Error('Direct merge failed without conflict paths')
      }
      return true
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

export function compose(cwd, upstream, selections, { timestamp = new Date().toISOString() } = {}) {
  git(cwd, ['checkout', '-B', 'personal-candidate', upstream])
  const included = [],
    conflicts = [],
    suppliedByUpstream = [],
    blockers = []
  for (const pr of selections) {
    if (pr.merged_at) {
      if (isAncestor(cwd, pr.merge_commit_sha, upstream)) {
        suppliedByUpstream.push(pr.number)
      } else {
        blockers.push({ number: pr.number, reason: 'Merge commit is not in frozen upstream' })
      }
      continue
    }
    const before = git(cwd, ['rev-parse', 'HEAD'])
    try {
      git(
        cwd,
        [
          'merge',
          '--no-ff',
          '--no-edit',
          '-m',
          `Orca Plus: #${pr.number} ${pr.head.sha}`,
          pr.head.sha
        ],
        { GIT_AUTHOR_DATE: timestamp, GIT_COMMITTER_DATE: timestamp }
      )
      included.push({ number: pr.number, head: pr.head.sha })
    } catch (error) {
      const paths = git(cwd, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean)
      git(cwd, ['reset', '--hard', before])
      if (!paths.length) {
        throw error
      }
      conflicts.push({
        number: pr.number,
        head: pr.head.sha,
        kind: directConflicts(cwd, upstream, pr.head.sha) ? 'upstream' : 'combination',
        paths,
        preceding: included.map((entry) => entry.number)
      })
    }
  }
  return {
    upstream,
    commit: git(cwd, ['rev-parse', 'HEAD']),
    tree: git(cwd, ['rev-parse', 'HEAD^{tree}']),
    included,
    conflicts,
    suppliedByUpstream,
    blockers,
    publishable: !conflicts.length && !blockers.length
  }
}
