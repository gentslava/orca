import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { composableLocalePaths, mergeTranslationCatalogs, parseCatalog } from './locale-merge.mjs'
import { reviewedMergePatches, applyReviewedMergePatch } from './reviewed-merge-patches.mjs'
import { fixtureRetirement, reviewedTargetPaths } from './retired-test-fixtures.mjs'
import { withGitHubReadRetry } from './github-read-retry.mjs'

export function git(cwd, args, extra = {}, { raw = false, inheritEnv = true } = {}) {
  const run = () =>
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
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
  const output = ['fetch', 'ls-remote'].includes(args[0]) ? withGitHubReadRetry(run) : run()
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
  freezeForkBranchHead(cwd, pr, source, 'closed', source.closedHeadSha, runGit)
}

export function freezeForeignHead(cwd, pr, runGit = git) {
  const source = pr.foreignHeadSource
  freezeForkBranchHead(cwd, pr, source, 'foreign', source.originalHeadSha, runGit)
}

function freezeForkBranchHead(cwd, pr, source, kind, originalHead, runGit) {
  if (runGit(cwd, ['rev-parse', `refs/personal/${kind}-pr-${pr.number}`]) !== originalHead) {
    throw new Error(`Original PR ${pr.number} moved after snapshot; rerun planning`)
  }
  runGit(cwd, ['check-ref-format', source.ref])
  runGit(cwd, [
    'fetch',
    '--no-tags',
    `https://github.com/${source.repository}.git`,
    `${source.ref}:refs/personal/pr-${pr.number}`
  ])
  if (runGit(cwd, ['rev-parse', `refs/personal/pr-${pr.number}`]) !== pr.head.sha) {
    throw new Error(`Fork PR ${pr.number} branch moved after snapshot; rerun planning`)
  }
  try {
    runGit(cwd, ['merge-base', '--is-ancestor', originalHead, pr.head.sha])
  } catch {
    throw new Error(`Fork PR ${pr.number} branch does not descend from its original head`)
  }
}

export function freezeForkFeatureHead(cwd, feature, runGit = git) {
  const ref = `refs/personal/feature-${feature.feature}`
  runGit(cwd, ['check-ref-format', feature.ref])
  runGit(cwd, [
    'fetch',
    '--no-tags',
    `https://github.com/${feature.repository}.git`,
    `${feature.ref}:${ref}`
  ])
  if (runGit(cwd, ['rev-parse', ref]) !== feature.head.sha) {
    throw new Error(`Fork feature ${feature.feature} branch moved after snapshot; rerun planning`)
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
    // Resolve using the PR parent; seal the result as one linear feature commit afterwards.
    writeFileSync(mergeHead, `${head}\n`)
  }
  if (failure) {
    throw failure
  }
}

// A pinned snapshot can predate a merge; the final PR head still applies as a feature
// only while it carries no upstream history newer than that snapshot.
function mergedAfterFrozenBaseline(cwd, pr, upstream, observed) {
  if (!observed || observed === upstream || !isAncestor(cwd, pr.merge_commit_sha, observed)) {
    return false
  }
  const shared = git(cwd, ['merge-base', '--all', pr.head.sha, observed])
  return /^[a-f0-9]{40}$/.test(shared) && isAncestor(cwd, shared, upstream)
}

// A branch merged with upstream newer than the pin would carry that upstream into its feature delta.
function carriesUnfrozenUpstream(cwd, head, upstream, observed) {
  if (!observed || observed === upstream) {
    return false
  }
  const shared = git(cwd, ['merge-base', '--all', head, observed])
  return !/^[a-f0-9]{40}$/.test(shared) || !isAncestor(cwd, shared, upstream)
}

const selectedIdentity = (entry) =>
  entry.feature ? { feature: entry.feature } : { number: entry.number }
const selectedSubject = (entry) =>
  entry.feature ? `feature ${entry.feature}` : `PR ${entry.number}`

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

function sealSelectedFeature(cwd, before, pr, timestamp) {
  const tree = git(cwd, ['write-tree'])
  const commit = git(
    cwd,
    [
      'commit-tree',
      tree,
      '-p',
      before,
      '-m',
      `fork: integrate ${selectedSubject(pr)}\n\nSource-Head: ${pr.head.sha}`
    ],
    {
      GIT_AUTHOR_DATE: timestamp,
      GIT_COMMITTER_DATE: timestamp
    }
  )
  git(cwd, ['reset', '--hard', commit])
}

export function compose(
  cwd,
  upstream,
  selections,
  {
    timestamp = new Date().toISOString(),
    resolutionsDirectory = join(import.meta.dirname, 'merge-resolutions'),
    observedUpstream
  } = {}
) {
  git(cwd, ['checkout', '-B', 'personal-candidate', upstream])
  const included = [],
    localeMerges = [],
    reviewedResolutions = [],
    retiredFixtures = [],
    conflicts = [],
    suppliedByUpstream = [],
    mergedAfterBaseline = [],
    satisfiedFeatures = [],
    blockers = []
  for (const pr of selections) {
    if (pr.feature) {
      if (isAncestor(cwd, pr.head.sha, upstream)) {
        satisfiedFeatures.push(pr.feature)
        continue
      }
      if (carriesUnfrozenUpstream(cwd, pr.head.sha, upstream, observedUpstream)) {
        blockers.push({
          feature: pr.feature,
          reason: 'Branch carries upstream history newer than the frozen upstream'
        })
        continue
      }
    } else if (pr.merged_at) {
      if (isAncestor(cwd, pr.merge_commit_sha, upstream)) {
        suppliedByUpstream.push(pr.number)
        continue
      }
      if (!mergedAfterFrozenBaseline(cwd, pr, upstream, observedUpstream)) {
        blockers.push({ number: pr.number, reason: 'Merge commit is not in frozen upstream' })
        continue
      }
      mergedAfterBaseline.push(pr.number)
    }
    const before = git(cwd, ['rev-parse', 'HEAD'])
    const identity = selectedIdentity(pr)
    const message = `fork: integrate ${selectedSubject(pr)}`
    try {
      prepareFeatureMerge(cwd, upstream, pr.head.sha, timestamp)
      git(cwd, ['commit', '-m', message], {
        GIT_AUTHOR_DATE: timestamp,
        GIT_COMMITTER_DATE: timestamp
      })
      const repaired = mergeAndValidateCatalogs(cwd, before, pr.head.sha, upstream)
      if (repaired.length) {
        git(
          cwd,
          ['commit', '-m', `fork: merge independent translation keys for ${selectedSubject(pr)}`],
          {
            GIT_AUTHOR_DATE: timestamp,
            GIT_COMMITTER_DATE: timestamp
          }
        )
        localeMerges.push({ ...identity, paths: repaired })
      }
      sealSelectedFeature(cwd, before, pr, timestamp)
      included.push({ ...identity, head: pr.head.sha })
    } catch (error) {
      const paths = git(cwd, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean)
      const resolution = resolveSelectedFeatureConflicts(cwd, resolutionsDirectory, upstream)
      if (resolution) {
        const repaired = mergeAndValidateCatalogs(cwd, before, pr.head.sha, upstream)
        git(cwd, ['commit', '-m', message], {
          GIT_AUTHOR_DATE: timestamp,
          GIT_COMMITTER_DATE: timestamp
        })
        sealSelectedFeature(cwd, before, pr, timestamp)
        included.push({ ...identity, head: pr.head.sha })
        const localePaths = [...new Set([...resolution.localePaths, ...repaired])]
        if (localePaths.length) {
          localeMerges.push({ ...identity, paths: localePaths })
        }
        if (resolution.patches.length) {
          reviewedResolutions.push({ ...identity, patches: resolution.patches })
        }
        if (resolution.retirements.length) {
          retiredFixtures.push({ ...identity, paths: resolution.retirements })
        }
        continue
      }
      git(cwd, ['reset', '--hard', before])
      if (!paths.length) {
        throw new Error(`${message}: ${error.message}`, { cause: error })
      }
      conflicts.push({
        ...identity,
        head: pr.head.sha,
        kind: directConflicts(cwd, upstream, pr.head.sha) ? 'upstream' : 'combination',
        paths,
        preceding: included.flatMap((entry) => (entry.feature ? [] : [entry.number])),
        ...(pr.feature
          ? { precedingFeatures: included.flatMap((entry) => entry.feature ?? []) }
          : {})
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
    mergedAfterBaseline,
    satisfiedFeatures,
    blockers,
    publishable: !conflicts.length && !blockers.length
  }
}
