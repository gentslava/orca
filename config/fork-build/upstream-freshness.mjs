import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { git } from './composition.mjs'

const repository = 'stablyai/orca'
const mainRef = 'refs/heads/main'

export function requireCurrentUpstream(
  plan,
  readMain = () =>
    git(process.cwd(), ['ls-remote', `https://github.com/${repository}.git`, mainRef])
) {
  if (plan?.repository !== repository || !/^[a-f0-9]{40}$/.test(plan.upstream || '')) {
    throw new Error('Invalid upstream identity in the source plan')
  }
  const match = /^([a-f0-9]{40})\trefs\/heads\/main\s*$/.exec(readMain())
  if (!match) {
    throw new Error('Could not verify the current upstream main')
  }
  if (match[1] !== plan.upstream) {
    throw new Error(
      `Upstream main moved from ${plan.upstream} to ${match[1]}; rerun composition and checks before publication`
    )
  }
  return match[1]
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const plan = JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8'))
  console.log(`Current upstream verified: ${requireCurrentUpstream(plan)}`)
}
