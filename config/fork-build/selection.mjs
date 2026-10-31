export function orderSelections(selections, dependencies = {}) {
  const records = new Map(selections.map((pr) => [pr.number, pr]))
  const ordered = [],
    visiting = new Set(),
    visited = new Set()
  function visit(number) {
    if (visiting.has(number)) {
      throw new Error(`Dependency cycle at #${number}`)
    }
    if (visited.has(number)) {
      return
    }
    if (!records.has(number)) {
      throw new Error(`Dependency missing: #${number}`)
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

export async function resolveSelection(config, { openOwn, previous = [], readPr }) {
  const numbers = new Set([
    ...config.seed,
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
      throw new Error(`Replacement cycle: ${[...chain, number]}`)
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
      throw new Error(`Invalid PR state/identity: #${number}`)
    }
    if (pr.base.ref !== config.base) {
      throw new Error(`Unsupported PR base: #${number}`)
    }
    if (pr.state === 'closed' && !pr.merged_at) {
      const replacement = config.replacements[number]
      lifecycle.push({
        number,
        disposition: replacement ? 'replaced' : 'closed-needs-review',
        ...(replacement ? { replacement } : {})
      })
      if (replacement) {
        await resolve(replacement, [...chain, number])
      } else {
        blockers.push({ number, reason: 'Closed without a recorded replacement or retirement' })
      }
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
