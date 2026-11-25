export function orderSelections(selections, dependencies = {}) {
  const records = new Map(selections.map((pr) => [pr.number, pr]))
  const ordered = [],
    visiting = new Set(),
    visited = new Set()
  function visit(number) {
    if (visiting.has(number)) {
      throw new Error(`Dependency cycle at PR ${number}`)
    }
    if (visited.has(number)) {
      return
    }
    if (!records.has(number)) {
      throw new Error(`Dependency missing: PR ${number}`)
    }
    visiting.add(number)
    for (const dependency of dependencies[number] || []) {
      visit(dependency)
    }
    visiting.delete(number)
    visited.add(number)
    ordered.push(records.get(number))
  }
  for (const number of [...records.keys()].sort((a, b) => a - b)) {
    visit(number)
  }
  return ordered
}

function validBranchSource(source) {
  return (
    source &&
    typeof source.repository === 'string' &&
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository) &&
    typeof source.ref === 'string' &&
    source.ref.startsWith('refs/heads/') &&
    !source.ref.includes(':') &&
    !/[\r\n]/.test(source.ref)
  )
}

const forkFeatureSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const forkFeatureFields = new Set(['ref', 'reason', 'repository'])

function declaredForkFeatures(config, forkRepository) {
  const declared = config.forkFeatures ?? {}
  if (typeof declared !== 'object' || Array.isArray(declared)) {
    throw new Error('Invalid fork feature declarations')
  }
  const branches = new Set(
    [
      ...Object.values(config.retainedHeadSources ?? {}),
      ...Object.values(config.foreignHeadSources ?? {})
    ].map((source) => `${source.repository}:${source.ref}`)
  )
  return Object.keys(declared)
    .sort()
    .map((slug) => {
      const entry = declared[slug]
      const source = { repository: entry?.repository ?? forkRepository, ref: entry?.ref }
      const branch = `${source.repository}:${source.ref}`
      if (
        !forkFeatureSlug.test(slug) ||
        slug.length > 64 ||
        Object.keys(entry ?? {}).some((field) => !forkFeatureFields.has(field)) ||
        typeof entry?.reason !== 'string' ||
        !entry.reason.trim() ||
        !validBranchSource(source) ||
        !config.authors.includes(source.repository.split('/')[0]) ||
        branches.has(branch)
      ) {
        throw new Error(`Invalid fork feature: ${slug}`)
      }
      branches.add(branch)
      return { feature: slug, ...source, reason: entry.reason }
    })
}

// Fork-local features have no upstream PR; only the exact named fork branch may supply them.
async function pinForkFeature(feature, readForkBranch) {
  const source = { repository: feature.repository, ref: feature.ref }
  const branch = typeof readForkBranch === 'function' ? await readForkBranch(source) : null
  if (
    branch?.repository !== source.repository ||
    branch.ref !== source.ref ||
    branch.object?.type !== 'commit' ||
    !/^[a-f0-9]{40}$/.test(branch.object.sha || '')
  ) {
    throw new Error(`Fork feature branch identity cannot be verified: ${feature.feature}`)
  }
  return { ...feature, head: { sha: branch.object.sha } }
}

export async function resolveSelection(
  config,
  { openOwn, previous = [], readPr, readRetainedHead, forkRepository, readForkBranch }
) {
  const retained = config.retainClosed || {}
  for (const [number, reason] of Object.entries(retained)) {
    if (
      typeof reason !== 'string' ||
      !reason.trim() ||
      config.exclude[number] ||
      config.replacements[number]
    ) {
      throw new Error(`Invalid closed PR retention: PR ${number}`)
    }
  }
  const retainedSources = config.retainedHeadSources || {}
  for (const [number, source] of Object.entries(retainedSources)) {
    if (!retained[number] || !validBranchSource(source)) {
      throw new Error(`Invalid retained PR branch source: PR ${number}`)
    }
  }
  const foreignSources = config.foreignHeadSources || {}
  for (const [number, source] of Object.entries(foreignSources)) {
    const included = config.include.find((entry) => entry.number === Number(number))
    if (
      !validBranchSource(source) ||
      !config.authors.includes(source.repository.split('/')[0]) ||
      typeof included?.reason !== 'string' ||
      !included.reason.trim() ||
      retainedSources[number] ||
      config.exclude[number] ||
      config.replacements[number]
    ) {
      throw new Error(`Invalid foreign PR branch source: PR ${number}`)
    }
  }
  const upstreamMerges = config.reviewedUpstreamMerges ?? {}
  for (const [number, receipt] of Object.entries(upstreamMerges)) {
    if (
      !/^[1-9]\d*$/.test(number) ||
      !Number.isSafeInteger(Number(number)) ||
      !/^[a-f0-9]{40}$/.test(receipt?.head || '') ||
      !/^[a-f0-9]{40}$/.test(receipt?.merge || '') ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(receipt?.mergedAt || '') ||
      typeof receipt?.reason !== 'string' ||
      !receipt.reason.trim() ||
      config.exclude[number] ||
      config.replacements[number] ||
      retained[number] ||
      foreignSources[number]
    ) {
      throw new Error(`Invalid reviewed upstream merge: PR ${number}`)
    }
  }
  const declaredFeatures = declaredForkFeatures(config, forkRepository)
  const numbers = new Set([
    ...config.seed,
    ...Object.keys(retained).map(Number),
    ...Object.keys(upstreamMerges).map(Number),
    ...previous,
    ...config.include.map((entry) => entry.number),
    ...openOwn
      .filter((pr) => config.authors.includes(pr.user.login) && pr.base.ref === config.base)
      .map((pr) => pr.number)
  ])
  const records = new Map(),
    visited = new Set(),
    lifecycle = [],
    blockers = []
  async function resolve(number, chain = []) {
    if (!Number.isSafeInteger(number) || number <= 0) {
      throw new Error('Invalid PR number')
    }
    if (chain.includes(number)) {
      throw new Error(`Replacement cycle: ${[...chain, number].join(' -> ')}`)
    }
    if (visited.has(number)) {
      return
    }
    visited.add(number)
    if (config.exclude[number]) {
      lifecycle.push({ number, disposition: 'excluded', reason: config.exclude[number] })
      return
    }
    const receipt = upstreamMerges[number]
    if (receipt) {
      records.set(number, {
        number,
        state: 'closed',
        head: { sha: receipt.head },
        merge_commit_sha: receipt.merge,
        merged_at: receipt.mergedAt,
        reviewedUpstreamMerge: receipt
      })
      lifecycle.push({
        number,
        disposition: 'reviewed-upstream-merge',
        head: receipt.head,
        reason: receipt.reason
      })
      return
    }
    const pr = await readPr(number)
    if (pr === null) {
      lifecycle.push({ number, disposition: 'unavailable-needs-review' })
      blockers.push({ number, reason: 'GitHub PR metadata unavailable (HTTP 404)' })
      return
    }
    if (!['open', 'closed'].includes(pr.state) || pr.number !== number) {
      throw new Error(`Invalid PR state/identity: PR ${number}`)
    }
    if (pr.base.ref !== config.base) {
      throw new Error(`Unsupported PR base: PR ${number}`)
    }
    const replacement = config.replacements[number]
    if (!pr.merged_at && replacement) {
      lifecycle.push({ number, disposition: 'replaced', replacement })
      await resolve(replacement, [...chain, number])
      return
    }
    const source = foreignSources[number]
    if (pr.state === 'closed' && !pr.merged_at && retained[number] && !source) {
      const source = retainedSources[number]
      let selected = pr
      if (source) {
        if (
          pr.head.repo?.full_name !== source.repository ||
          `refs/heads/${pr.head.ref}` !== source.ref ||
          typeof readRetainedHead !== 'function'
        ) {
          throw new Error(`Retained PR branch identity cannot be verified: PR ${number}`)
        }
        const sha = await readRetainedHead(source)
        if (!/^[a-f0-9]{40}$/.test(sha)) {
          throw new Error(`Invalid retained PR branch head: PR ${number}`)
        }
        selected = {
          ...pr,
          head: { ...pr.head, sha },
          retainedHeadSource: { ...source, closedHeadSha: pr.head.sha }
        }
      }
      records.set(number, selected)
      lifecycle.push({
        number,
        disposition: 'retained-closed',
        head: selected.head.sha,
        reason: retained[number]
      })
      return
    }
    if (pr.state === 'closed' && !pr.merged_at && !retained[number]) {
      lifecycle.push({ number, disposition: 'closed-needs-review' })
      blockers.push({ number, reason: 'Closed without a recorded replacement or retirement' })
      return
    }
    if (!pr.merged_at && source) {
      if (config.authors.includes(pr.user.login) || typeof readRetainedHead !== 'function') {
        throw new Error(`Foreign PR branch identity cannot be verified: PR ${number}`)
      }
      const sha = await readRetainedHead(source)
      if (!/^[a-f0-9]{40}$/.test(sha)) {
        throw new Error(`Invalid foreign PR branch head: PR ${number}`)
      }
      records.set(number, {
        ...pr,
        head: { ...pr.head, sha },
        foreignHeadSource: { ...source, originalHeadSha: pr.head.sha }
      })
      lifecycle.push({
        number,
        disposition: pr.state === 'closed' ? 'retained-closed' : 'fork-integrated',
        head: sha,
        ...(pr.state === 'closed' ? { reason: retained[number] } : {})
      })
      return
    }
    records.set(number, pr)
    lifecycle.push({
      number,
      disposition: pr.merged_at ? 'merged-check-ancestry' : 'selected',
      head: pr.head.sha
    })
  }
  for (const number of [...numbers].sort((a, b) => a - b)) {
    await resolve(number)
  }
  const forkFeatures = []
  for (const feature of declaredFeatures) {
    forkFeatures.push(await pinForkFeature(feature, readForkBranch))
  }
  return {
    selections: orderSelections([...records.values()], config.dependencies),
    forkFeatures,
    lifecycle,
    blockers,
    tracked: [...new Set([...numbers, ...records.keys()])].sort((a, b) => a - b)
  }
}
