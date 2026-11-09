import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { composableLocalePaths, mergeTranslationCatalogs, parseCatalog } from './locale-merge.mjs'
import { reviewedMergePatches, applyReviewedMergePatch } from './reviewed-merge-patches.mjs'
import { fixtureRetirement, reviewedTargetPaths } from './retired-test-fixtures.mjs'

export function git(cwd, args, extra = {}, { raw = false, inheritEnv = true } = {}) {
  const output = execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...(inheritEnv ? process.env : {}),
      GIT_AUTHOR_NAME: 'github-actions[bot]',
      GIT_AUTHOR_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
      GIT_COMMITTER_NAME: 'github-actions[bot]',
      GIT_COMMITTER_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
      ...extra
    }
  })
  return raw ? output : output.trim()
}

export function readPublishableComposition(planPath, application) {
  const root = resolve(application)
  const plan = JSON.parse(readFileSync(resolve(planPath), 'utf8'))
  if (
    !plan.result?.publishable ||
    plan.error ||
    !/^[a-f0-9]{40}$/.test(plan.upstream || '') ||
    !/^[a-f0-9]{40}$/.test(plan.result.commit || '') ||
    git(root, ['rev-parse', 'HEAD']) !== plan.result.commit ||
    git(root, ['rev-parse', 'HEAD^{tree}']) !== plan.result.tree
  ) {
    throw new Error('Source does not match a publishable composition')
  }
  return { root, plan }
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
    throw new Error(`PR ${number} moved after snapshot; rerun planning`)
  }
}

export function freezeRetainedHead(cwd, pr, runGit = git) {
  const source = pr.retainedHeadSource
  if (runGit(cwd, ['rev-parse', `refs/personal/closed-pr-${pr.number}`]) !== source.closedHeadSha) {
    throw new Error(`Closed PR ${pr.number} moved after snapshot; rerun planning`)
  }
  runGit(cwd, ['check-ref-format', source.ref])
  runGit(cwd, [
    'fetch',
    '--no-tags',
    `https://github.com/${source.repository}.git`,
    `${source.ref}:refs/personal/pr-${pr.number}`
  ])
  if (runGit(cwd, ['rev-parse', `refs/personal/pr-${pr.number}`]) !== pr.head.sha) {
    throw new Error(`Retained PR ${pr.number} branch moved after snapshot; rerun planning`)
  }
  try {
    runGit(cwd, ['merge-base', '--is-ancestor', source.closedHeadSha, pr.head.sha])
  } catch {
    throw new Error(`Retained PR ${pr.number} branch does not descend from its closed head`)
  }
}

function mergeAndValidateCatalogs(cwd, before, incoming, upstream) {
  const repaired = []
  let base
  for (const path of composableLocalePaths) {
    if (!existsSync(join(cwd, path))) {
      continue
    }
    try {
      parseCatalog(readFileSync(join(cwd, path), 'utf8'))
    } catch (error) {
      try {
        base ??= git(cwd, ['merge-base', '--all', upstream, incoming])
        if (!/^[a-f0-9]{40}$/.test(base)) {
          throw new Error('Translation merge requires one common ancestor')
        }
        repaired.push([
          path,
          mergeTranslationCatalogs(
            git(cwd, ['show', `${base}:${path}`]),
            git(cwd, ['show', `${before}:${path}`]),
            git(cwd, ['show', `${incoming}:${path}`])
          )
        ])
      } catch {
        throw new Error(`Invalid merged translation catalog ${path}: ${error.message}`)
      }
    }
  }
  for (const [path, text] of repaired) {
    writeFileSync(join(cwd, path), text)
  }
  const paths = repaired.map(([path]) => path)
  if (paths.length) {
    git(cwd, ['add', '--', ...paths])
  }
  return paths
}

export function resolveSelectedFeatureConflicts(cwd, resolutionsDirectory, upstream) {
  const paths = git(cwd, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean)
  if (!paths.length) {
    return null
  }
  const reviewed = resolutionsDirectory
    ? reviewedMergePatches(cwd, paths, resolutionsDirectory, git)
    : new Map()
  const merged = [],
    localePaths = [],
    patches = [],
    retirements = []
  const reviewedPaths = reviewedTargetPaths(resolutionsDirectory)
  for (const path of paths) {
    if (reviewed.has(path)) {
      continue
    }
    if (!composableLocalePaths.has(path)) {
      const retirement = fixtureRetirement(cwd, path, upstream, git, reviewedPaths)
      if (!retirement) {
        return null
      }
      retirements.push(retirement)
      continue
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
  for (const retirement of retirements) {
    rmSync(join(cwd, retirement.path), { force: true })
  }
  git(cwd, ['add', '--', ...paths])
  return { localePaths, patches, retirements }
}

export function prepareFeatureMerge(cwd, upstream, head, timestamp) {
  const base = git(cwd, ['merge-base', '--all', upstream, head])
  if (!/^[a-f0-9]{40}$/.test(base)) {
    throw new Error('Selected feature requires one upstream merge base')
  }
  const dates = timestamp ? { GIT_AUTHOR_DATE: timestamp, GIT_COMMITTER_DATE: timestamp } : {}
  const snapshot = git(
    cwd,
    ['commit-tree', `${head}^{tree}`, '-p', base, '-m', 'Temporary feature snapshot'],
    dates
  )
  let failure
  try {
    git(cwd, ['merge', '--no-ff', '--no-commit', snapshot], dates)
  } catch (error) {
    failure = error
  }
  const mergeHead = resolve(cwd, git(cwd, ['rev-parse', '--git-path', 'MERGE_HEAD']))
  if (existsSync(mergeHead)) {
    if (readFileSync(mergeHead, 'utf8').trim() !== snapshot) {
      throw new Error('Unexpected feature merge parent')
    }
    // Merge the isolated upstream delta, but retain the original PR as the actual parent.
    writeFileSync(mergeHead, `${head}\n`)
  }
  if (failure) {
    throw failure
  }
}

function directConflicts(cwd, upstream, sha) {
  const directory = mkdtempSync(join(tmpdir(), 'personal-conflict-'))
  try {
    git(directory, ['clone', '--shared', '--no-checkout', cwd, '.'])
    git(directory, ['checkout', '--detach', upstream])
    try {
      prepareFeatureMerge(directory, upstream, sha)
      return false
    } catch {
      if (!git(directory, ['diff', '--name-only', '--diff-filter=U'])) {
        throw new Error('Direct merge failed without conflict paths')
      }
      return !resolveSelectedFeatureConflicts(directory, undefined, upstream)
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
    retiredFixtures = [],
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
    const message = `fork: integrate PR ${pr.number}`
    try {
      prepareFeatureMerge(cwd, upstream, pr.head.sha, timestamp)
      git(cwd, ['commit', '-m', message], {
        GIT_AUTHOR_DATE: timestamp,
        GIT_COMMITTER_DATE: timestamp
      })
      const repaired = mergeAndValidateCatalogs(cwd, before, pr.head.sha, upstream)
      if (repaired.length) {
        git(cwd, ['commit', '-m', `fork: merge independent translation keys for PR ${pr.number}`], {
          GIT_AUTHOR_DATE: timestamp,
          GIT_COMMITTER_DATE: timestamp
        })
        localeMerges.push({ number: pr.number, paths: repaired })
      }
      included.push({ number: pr.number, head: pr.head.sha })
    } catch (error) {
      const paths = git(cwd, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean)
      const resolution = resolveSelectedFeatureConflicts(cwd, resolutionsDirectory, upstream)
      if (resolution) {
        const repaired = mergeAndValidateCatalogs(cwd, before, pr.head.sha, upstream)
        git(cwd, ['commit', '-m', message], {
          GIT_AUTHOR_DATE: timestamp,
          GIT_COMMITTER_DATE: timestamp
        })
        included.push({ number: pr.number, head: pr.head.sha })
        const localePaths = [...new Set([...resolution.localePaths, ...repaired])]
        if (localePaths.length) {
          localeMerges.push({ number: pr.number, paths: localePaths })
        }
        if (resolution.patches.length) {
          reviewedResolutions.push({ number: pr.number, patches: resolution.patches })
        }
        if (resolution.retirements.length) {
          retiredFixtures.push({ number: pr.number, paths: resolution.retirements })
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
    retiredFixtures,
    conflicts,
    suppliedByUpstream,
    blockers,
    publishable: !conflicts.length && !blockers.length
  }
}
