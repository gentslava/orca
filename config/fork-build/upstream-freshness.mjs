import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { git } from './composition.mjs'
import { requireUpstreamBuildAncestor } from './upstream-build-baseline.mjs'

const repository = 'stablyai/orca'
const mainRef = 'refs/heads/main'

function verifySnapshotAncestry(selected, observed, current) {
  const cwd = process.cwd()
  git(cwd, [
    'fetch',
    '--no-tags',
    `https://github.com/${repository}.git`,
    ...new Set([selected, observed, current])
  ])
  requireUpstreamBuildAncestor(cwd, selected, observed)
  requireUpstreamBuildAncestor(cwd, observed, current)
}

export function requireCurrentUpstream(
  plan,
  readMain = () =>
    git(process.cwd(), ['ls-remote', `https://github.com/${repository}.git`, mainRef]),
  verifySnapshot = verifySnapshotAncestry
) {
  if (plan?.repository !== repository || !/^[a-f0-9]{40}$/.test(plan.upstream || '')) {
    throw new Error('Invalid upstream identity in the source plan')
  }
  const match = /^([a-f0-9]{40})\trefs\/heads\/main\s*$/.exec(readMain())
  if (!match) {
    throw new Error('Could not verify the current upstream main')
  }
  if (match[1] !== plan.upstream) {
    const baseline = plan.upstreamBaseline
    if (baseline?.requested === true || baseline?.pinned === true) {
      if (!/^[a-f0-9]{40}$/.test(baseline.observed || '')) {
        throw new Error('Invalid observed upstream identity for the explicit build snapshot')
      }
      verifySnapshot(plan.upstream, baseline.observed, match[1])
    } else {
      throw new Error(
        `Upstream main moved from ${plan.upstream} to ${match[1]}; rerun composition and checks before publication`
      )
    }
  }
  return match[1]
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const plan = JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8'))
  console.log(
    `Upstream baseline ${plan.upstream} verified against current main ${requireCurrentUpstream(plan)}`
  )
}
