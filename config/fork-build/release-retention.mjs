import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { api, readLedger } from './github.mjs'
import { packageTargets, personalPackageOutputs } from './package-targets.mjs'

const repository = 'gentslava/orca'
const personalTag = /^personal-[1-9]\d*-[1-9]\d*$/
const commitSha = /^[a-f0-9]{40}$/

function matchesRelease(ledger, plan) {
  const good = ledger?.lastGood
  return (
    good?.tag === plan.releaseTag &&
    good.promoted === true &&
    good.fingerprint === plan.fingerprint &&
    good.commit === plan.result.commit
  )
}

function isPersonalRelease(release) {
  return (
    release.draft === false && release.prerelease === true && personalTag.test(release.tag_name)
  )
}

const requiredAssets = [
  'release-verification.json',
  'SHA256SUMS',
  'source.bundle',
  'orca-macos-arm64.dmg',
  ...packageTargets(personalPackageOutputs).flatMap((target) => target.files ?? [])
]

function hasVerifiedAssets(release) {
  const uploaded = new Set(
    release.assets
      ?.filter(
        (asset) =>
          asset.state === 'uploaded' && asset.size > 0 && /^sha256:[a-f0-9]{64}$/.test(asset.digest)
      )
      .map((asset) => asset.name)
  )
  return (
    requiredAssets.every((name) => uploaded.has(name)) &&
    [...uploaded].some((name) => /^Orca-.+-arm64-mac\.zip$/.test(name))
  )
}

export function retainCurrentRelease({ plan, environment, read, remove, record, apply = false }) {
  const receipt = { kept: [], candidates: [], deleted: [], deleteGitTags: false, preview: !apply }
  if (
    environment.GITHUB_REPOSITORY !== repository ||
    environment.GITHUB_REF !== 'refs/heads/master' ||
    environment.PUBLICATION !== 'success' ||
    environment.BRANCH_SYNC !== 'success' ||
    plan.auditOnly ||
    plan.reuse ||
    plan.error ||
    plan.result?.publishable !== true
  ) {
    return { ...receipt, skipped: true }
  }
  const run = environment.GITHUB_RUN_ID
  const tag = plan.releaseTag
  if (
    !/^[1-9]\d*$/.test(run || '') ||
    !personalTag.test(tag) ||
    !tag.startsWith(`personal-${run}-`)
  ) {
    throw new Error('Release retention requires a tag from this workflow run')
  }
  if (
    !commitSha.test(plan.configuration) ||
    plan.configuration !== environment.GITHUB_SHA ||
    !commitSha.test(plan.result.commit) ||
    !/^[a-f0-9]{64}$/.test(plan.fingerprint)
  ) {
    throw new Error('Release retention requires a complete verified source identity')
  }
  const config = JSON.parse(readFileSync(join(import.meta.dirname, 'selection.json'), 'utf8'))
  const ledgerPath = `repos/${repository}/issues/${config.statusIssue}`
  const checkLiveLedger = () => {
    if (!matchesRelease(readLedger(read(ledgerPath).body), plan)) {
      throw new Error('Last successful release changed; refusing cleanup')
    }
  }
  checkLiveLedger()
  const releases = []
  for (let page = 1; ; page++) {
    const batch = read(`repos/${repository}/releases?per_page=100&page=${page}`)
    if (!Array.isArray(batch)) {
      throw new Error('Invalid release inventory')
    }
    releases.push(...batch.filter(isPersonalRelease))
    if (batch.length < 100) {
      break
    }
  }
  const ids = new Set()
  const tags = new Set()
  for (const release of releases) {
    if (
      !Number.isSafeInteger(release.id) ||
      release.id <= 0 ||
      ids.has(release.id) ||
      tags.has(release.tag_name)
    ) {
      throw new Error('Invalid or repeated release identity')
    }
    ids.add(release.id)
    tags.add(release.tag_name)
    if (!Number.isFinite(Date.parse(release.published_at))) {
      throw new Error('Published release has no valid publication date')
    }
  }
  const current = releases.find((release) => release.tag_name === tag)
  if (!current || current.target_commitish !== plan.result.commit || !hasVerifiedAssets(current)) {
    throw new Error('Published release does not match the verified source')
  }

  const older = releases.filter((release) => release.id !== current.id)
  if (
    older.some((release) => Date.parse(release.published_at) >= Date.parse(current.published_at))
  ) {
    throw new Error('A newer or simultaneous personal release exists; refusing cleanup')
  }
  const entry = ({ id, tag_name }) => ({ id, tag: tag_name })
  receipt.kept.push(entry(current))
  const previous = plan.previous?.lastGood
  if (!previous?.promoted) {
    record(receipt)
    return receipt
  }
  const rollback = older.find((release) => release.tag_name === previous.tag)
  if (!rollback || rollback.target_commitish !== previous.commit || !hasVerifiedAssets(rollback)) {
    throw new Error('Previous promoted release is unavailable for rollback; refusing cleanup')
  }
  receipt.kept.push(entry(rollback))
  const candidates = older.filter(
    (release) => Date.parse(release.published_at) < Date.parse(rollback.published_at)
  )
  receipt.candidates = candidates.map(entry)
  record(receipt)
  if (!apply) {
    return receipt
  }

  for (const release of candidates) {
    checkLiveLedger()
    const live = read(`repos/${repository}/releases/${release.id}`)
    if (
      !isPersonalRelease(live) ||
      live.id !== release.id ||
      live.tag_name !== release.tag_name ||
      live.published_at !== release.published_at ||
      live.target_commitish !== release.target_commitish
    ) {
      throw new Error('Release changed since inventory; refusing deletion')
    }
    remove(`repos/${repository}/releases/${release.id}`)
    receipt.deleted.push(entry(release))
    record(receipt)
  }
  return receipt
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, mode] = process.argv.slice(2)
  if (!directory || (mode !== undefined && mode !== '--apply')) {
    throw new Error('Usage: node release-retention.mjs PLAN_DIRECTORY [--apply]')
  }
  const receiptPath = join(directory, 'release-retention.json')
  const result = retainCurrentRelease({
    plan: JSON.parse(readFileSync(join(directory, 'plan.json'), 'utf8')),
    environment: process.env,
    read: api,
    remove: (path) => execFileSync('gh', ['api', '--method', 'DELETE', path], { stdio: 'inherit' }),
    record: (receipt) => writeFileSync(receiptPath, JSON.stringify(receipt, null, 2)),
    apply: mode === '--apply'
  })
  writeFileSync(receiptPath, JSON.stringify(result, null, 2))
}
