import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { composableLocalePaths, mergeTranslationCatalogs, parseCatalog } from './locale-merge.mjs'
import { reviewedMergePatches, applyReviewedMergePatch } from './reviewed-merge-patches.mjs'

export function git(cwd, args, extra = {}, { raw = false } = {}) {
  const output = execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Orca Plus',
      GIT_AUTHOR_EMAIL: 'plus@users.noreply.github.com',
      GIT_COMMITTER_NAME: 'Orca Plus',
      GIT_COMMITTER_EMAIL: 'plus@users.noreply.github.com',
      ...extra
    }
  })
  return raw ? output : output.trim()
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

function assertMergedCatalogs(cwd) {
  for (const path of composableLocalePaths) {
    if (!existsSync(join(cwd, path))) {
      continue
    }
    try {
      parseCatalog(readFileSync(join(cwd, path), 'utf8'))
    } catch (error) {
      throw new Error(`Invalid merged translation catalog ${path}: ${error.message}`)
    }
  }
}

export function resolveSelectedFeatureConflicts(cwd, resolutionsDirectory) {
  const paths = git(cwd, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean)
  if (!paths.length) {
    return null
  }
  const reviewed = resolutionsDirectory
    ? reviewedMergePatches(cwd, paths, resolutionsDirectory, git)
    : new Map()
  const merged = [],
    localePaths = [],
    patches = []
  for (const path of paths) {
    if (reviewed.has(path)) {
      continue
    }
    if (!composableLocalePaths.has(path)) {
      return null
    }
    try {
      merged.push([
        path,
        mergeTranslationCatalogs(
          git(cwd, ['show', `:1:${path}`]),
          git(cwd, ['show', `:2:${path}`]),
          git(cwd, ['show', `:3:${path}`])
        )
      ])
      localePaths.push(path)
    } catch {
      return null
    }
  }
  for (const [path, entry] of reviewed) {
    patches.push(applyReviewedMergePatch(cwd, path, entry, git))
  }
  for (const [path, text] of merged) {
    writeFileSync(join(cwd, path), text)
  }
  git(cwd, ['add', '--', ...paths])
  return { localePaths, patches }
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
      return !resolveSelectedFeatureConflicts(directory)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

export function compose(
  cwd,
  upstream,
  selections,
  {
    timestamp = new Date().toISOString(),
    resolutionsDirectory = join(import.meta.dirname, 'merge-resolutions')
  } = {}
) {
  git(cwd, ['checkout', '-B', 'personal-candidate', upstream])
  const included = [],
    localeMerges = [],
    reviewedResolutions = [],
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
      assertMergedCatalogs(cwd)
      included.push({ number: pr.number, head: pr.head.sha })
    } catch (error) {
      const paths = git(cwd, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean)
      const resolution = resolveSelectedFeatureConflicts(cwd, resolutionsDirectory)
      if (resolution) {
        git(cwd, ['commit', '--no-edit'], {
          GIT_AUTHOR_DATE: timestamp,
          GIT_COMMITTER_DATE: timestamp
        })
        assertMergedCatalogs(cwd)
        included.push({ number: pr.number, head: pr.head.sha })
        if (resolution.localePaths.length) {
          localeMerges.push({ number: pr.number, paths: resolution.localePaths })
        }
        if (resolution.patches.length) {
          reviewedResolutions.push({ number: pr.number, patches: resolution.patches })
        }
        continue
      }
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
    localeMerges,
    reviewedResolutions,
    conflicts,
    suppliedByUpstream,
    blockers,
    publishable: !conflicts.length && !blockers.length
  }
}
