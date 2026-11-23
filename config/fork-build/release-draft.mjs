import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { withGitHubReadRetry } from './github-read-retry.mjs'
import { hashFile } from '../scripts/fork-upstream-archives.mjs'

const [planDir, packagesDir] = process.argv.slice(2)
const plan = JSON.parse(readFileSync(join(planDir, 'plan.json'), 'utf8'))
const { RELEASE_TAG: tag, GITHUB_REPOSITORY: repository, GITHUB_SHA: configuration } = process.env
if (
  repository !== 'gentslava/orca' ||
  !/^personal-\d+-\d+$/.test(tag || '') ||
  tag !== plan.releaseTag ||
  configuration !== plan.configuration ||
  plan.auditOnly ||
  plan.reuse ||
  plan.error ||
  !plan.result?.publishable
) {
  throw new Error('Release draft requires a complete, trusted source plan')
}

const verification = JSON.parse(
  readFileSync(join(packagesDir, 'release-verification.json'), 'utf8')
)
if (
  verification.verified !== true ||
  verification.commit !== plan.result.commit ||
  verification.fingerprint !== plan.fingerprint
) {
  throw new Error('Release verification differs from the staged source plan')
}

const paths = [
  ...readdirSync(packagesDir)
    .sort()
    .map((file) => join(packagesDir, file)),
  join(planDir, 'plan.json'),
  join(planDir, 'source.bundle')
]
const files = new Map(
  paths.map((path) => [
    basename(path),
    { path, size: statSync(path).size, digest: 'sha256:' + hashFile(path) }
  ])
)
if (files.size !== paths.length) {
  throw new Error('Duplicate release asset names')
}

function gh(command, args = []) {
  return execFileSync('gh', ['release', command, tag, '--repo', repository, ...args], {
    encoding: 'utf8'
  })
}

function view() {
  try {
    return JSON.parse(
      withGitHubReadRetry(() => gh('view', ['--json', 'targetCommitish,isDraft,assets']))
    )
  } catch (error) {
    if (/^release not found\s*$/i.test(error.stderr?.toString() || '')) {
      return null
    }
    throw error
  }
}

function missingAssets(release) {
  if (
    !release ||
    release.targetCommitish !== (release.isDraft ? configuration : plan.result.commit)
  ) {
    throw new Error('Staged release targets a different configuration')
  }
  const missing = new Map(files)
  for (const asset of release.assets) {
    const expected = missing.get(asset.name)
    if (
      !expected ||
      asset.state !== 'uploaded' ||
      asset.size !== expected.size ||
      asset.digest !== expected.digest
    ) {
      throw new Error(`Staged release asset differs from the verified bytes: ${asset.name}`)
    }
    missing.delete(asset.name)
  }
  return [...missing.values()].map(({ path }) => path)
}

let release = view()
if (!release) {
  gh('create', [
    '--target',
    configuration,
    '--draft',
    '--prerelease',
    '--latest=false',
    '--title',
    `Orca personal macOS + Windows + Linux + Android ${process.env.GITHUB_RUN_NUMBER}`,
    '--notes-file',
    join(planDir, 'report.md')
  ])
  release = view()
}
const missing = missingAssets(release)
if (missing.length) {
  if (!release.isDraft) {
    throw new Error('Published releases are immutable')
  }
  gh('upload', missing)
}
if (missingAssets(view()).length) {
  throw new Error('Incomplete release asset inventory')
}
console.log(`All ${files.size} release assets verified in ${tag}`)
