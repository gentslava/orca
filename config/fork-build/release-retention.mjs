import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { api, readLedger } from './github.mjs'

const repository = 'gentslava/orca'

function matchesRelease(ledger, plan, tag) {
  const good = ledger?.lastGood
  return (
    good?.tag === tag &&
    good.promoted === true &&
    good.fingerprint === plan.fingerprint &&
    good.commit === plan.result.commit
  )
}

export function retainCurrentRelease({ plan, ledger, environment, read, remove, record }) {
  const receipt = { kept: null, deleted: [], deleteGitTags: false }
  if (
    environment.GITHUB_REPOSITORY !== repository ||
    environment.GITHUB_REF !== 'refs/heads/master' ||
    environment.PUBLICATION !== 'success' ||
    environment.BRANCH_SYNC !== 'success' ||
    plan.auditOnly ||
    plan.reuse ||
    plan.result?.publishable !== true
  ) {
    return { ...receipt, skipped: true }
  }
  const run = environment.GITHUB_RUN_ID
  const attempt = environment.GITHUB_RUN_ATTEMPT
  if (!/^[1-9]\d*$/.test(run || '') || !/^[1-9]\d*$/.test(attempt || '')) {
    throw new Error('Release retention requires a valid run and attempt')
  }
  if (
    !/^[a-f0-9]{40}$/.test(plan.configuration || '') ||
    !/^[a-f0-9]{40}$/.test(plan.result.commit || '') ||
    !/^[a-f0-9]{64}$/.test(plan.fingerprint || '')
  ) {
    throw new Error('Release retention requires a complete verified source identity')
  }
  const tag = `personal-${run}-${attempt}`
  if (!matchesRelease(ledger, plan, tag)) {
    throw new Error('Release retention requires the current promoted ledger')
  }
  const config = JSON.parse(readFileSync(join(import.meta.dirname, 'selection.json'), 'utf8'))
  const ledgerPath = `repos/${repository}/issues/${config.statusIssue}`
  const checkLiveLedger = () => {
    if (!matchesRelease(readLedger(read(ledgerPath).body), plan, tag)) {
      throw new Error('Last successful release changed; refusing cleanup')
    }
  }
  checkLiveLedger()
  const releases = []
  for (let page = 1; ; page++) {
    const batch = read(`repos/${repository}/releases?per_page=100&page=${page}`)
    if (!Array.isArray(batch)) throw new Error('Invalid release inventory')
    releases.push(...batch)
    if (batch.length < 100) break
  }
  const ids = new Set()
  for (const release of releases) {
    if (!Number.isSafeInteger(release.id) || release.id <= 0 || ids.has(release.id)) {
      throw new Error('Invalid or repeated release identity')
    }
    ids.add(release.id)
    if (!release.draft && !Number.isFinite(Date.parse(release.published_at))) {
      throw new Error('Published release has no valid publication date')
    }
  }
  const current = releases.filter((release) => release.tag_name === tag)
  if (
    current.length !== 1 ||
    current[0].draft ||
    current[0].target_commitish !== plan.configuration
  ) {
    throw new Error('Published release does not match the verified configuration')
  }
  const keep = current[0]
  const older = releases.filter((release) => !release.draft && release.id !== keep.id)
  if (older.some((release) => Date.parse(release.published_at) >= Date.parse(keep.published_at))) {
    throw new Error('A newer release exists; refusing cleanup')
  }
  receipt.kept = { id: keep.id, tag: keep.tag_name }
  record(receipt)
  for (const release of older) {
    checkLiveLedger()
    const live = read(`repos/${repository}/releases/${release.id}`)
    if (
      live.id !== release.id ||
      live.tag_name !== release.tag_name ||
      live.draft ||
      live.published_at !== release.published_at
    ) {
      throw new Error('Release changed since inventory; refusing deletion')
    }
    remove(`repos/${repository}/releases/${release.id}`)
    receipt.deleted.push({ id: release.id, tag: release.tag_name })
    record(receipt)
  }
  return receipt
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = process.argv[2]
  const receiptPath = join(directory, 'release-retention.json')
  const result = retainCurrentRelease({
    plan: JSON.parse(readFileSync(join(directory, 'plan.json'), 'utf8')),
    ledger: JSON.parse(readFileSync(join(directory, 'status-ledger.json'), 'utf8')),
    environment: process.env,
    read: api,
    remove: (path) => execFileSync('gh', ['api', '--method', 'DELETE', path], { stdio: 'inherit' }),
    record: (receipt) => writeFileSync(receiptPath, JSON.stringify(receipt, null, 2))
  })
  writeFileSync(receiptPath, JSON.stringify(result, null, 2))
}
