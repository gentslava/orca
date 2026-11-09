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

export async function resolveSelection(
  config,
  { openOwn, previous = [], readPr, readRetainedHead }
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
    if (
      !retained[number] ||
      !source ||
      typeof source.repository !== 'string' ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository) ||
      typeof source.ref !== 'string' ||
      !source.ref.startsWith('refs/heads/') ||
      source.ref.includes(':') ||
      /[\r\n]/.test(source.ref)
    ) {
      throw new Error(`Invalid retained PR branch source: PR ${number}`)
    }
  }
  const numbers = new Set([
    ...config.seed,
    ...Object.keys(retained).map(Number),
    ...previous,
    ...config.include.map((entry) => entry.number),
    ...openOwn
      .filter((pr) => config.authors.includes(pr.user.login) && pr.base.ref === config.base)
      .map((pr) => pr.number)
  ])
  const records = new Map(),
    lifecycle = [],
    blockers = []
  async function resolve(number, chain = []) {
    if (!Number.isSafeInteger(number) || number <= 0) {
      throw new Error('Invalid PR number')
    }
    if (chain.includes(number)) {
      throw new Error(`Replacement cycle: ${[...chain, number].join(' -> ')}`)
    }
    if (config.exclude[number]) {
      lifecycle.push({ number, disposition: 'excluded', reason: config.exclude[number] })
      return
    }
    if (records.has(number)) {
      return
    }
    const pr = await readPr(number)
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
    if (pr.state === 'closed' && !pr.merged_at && retained[number]) {
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
    if (pr.state === 'closed' && !pr.merged_at) {
      lifecycle.push({ number, disposition: 'closed-needs-review' })
      blockers.push({ number, reason: 'Closed without a recorded replacement or retirement' })
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
  return {
    selections: orderSelections([...records.values()], config.dependencies),
    lifecycle,
    blockers,
    tracked: [...new Set([...numbers, ...records.keys()])].sort((a, b) => a - b)
  }
}
