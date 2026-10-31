import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { git } from './composition.mjs'
import { stagePreviewArchives, verifyStagedArchives } from '../scripts/fork-upstream-archives.mjs'

const [command, input, location] = process.argv.slice(2)
const plan = JSON.parse(readFileSync(resolve(input), 'utf8'))
if (!plan.result?.publishable || plan.error || plan.auditOnly || plan.reuse) {
  throw new Error('Plan is not eligible for packaging/publication')
}
for (const sha of [plan.configuration, plan.upstream, plan.result.commit, plan.result.tree]) {
  if (!/^[a-f0-9]{40}$/.test(sha || '')) {
    throw new Error('Invalid source identity')
  }
}
const expected = {
  commit: plan.result.commit,
  version: plan.version,
  formats: 'both',
  forkSha: plan.configuration,
  upstreamSha: plan.upstream
}
if (command === 'prepare') {
  const application = resolve(location)
  mkdirSync(application, { recursive: true })
  git(application, ['init'])
  git(application, ['remote', 'add', 'origin', `https://github.com/${plan.repository}.git`])
  git(application, ['fetch', '--no-tags', 'origin', plan.upstream])
  git(application, ['bundle', 'verify', join(resolve(input, '..'), 'source.bundle')])
  git(application, [
    'fetch',
    join(resolve(input, '..'), 'source.bundle'),
    'refs/heads/personal-candidate'
  ])
  if (
    git(application, ['rev-parse', 'FETCH_HEAD']) !== expected.commit ||
    git(application, ['rev-parse', 'FETCH_HEAD^{tree}']) !== plan.result.tree
  ) {
    throw new Error('Downloaded source differs from the planned commit/tree')
  }
  git(application, ['checkout', '--detach', expected.commit])
  appendFileSync(
    process.env.GITHUB_ENV,
    `ORCA_BUILD_COMMIT=${expected.commit}\nORCA_LOCAL_BUILD_VERSION=${expected.version}\n`
  )
} else if (command === 'stage') {
  const application = resolve(location)
  if (
    git(application, ['rev-parse', 'HEAD']) !== expected.commit ||
    git(application, ['status', '--porcelain', '--untracked-files=no'])
  ) {
    throw new Error('Build modified the frozen source')
  }
  stagePreviewArchives({
    app: join(application, 'dist/mac-arm64/Orca.app'),
    dist: join(application, 'dist'),
    directory: join(application, 'personal-packages'),
    ...expected,
    metadata: {
      configurationCommit: plan.configuration,
      forkMaster: plan.configuration,
      upstreamMain: plan.upstream,
      compositionTree: plan.result.tree,
      fingerprint: plan.fingerprint,
      developerIdSigned: false,
      notarized: false,
      updater: 'disabled for fork-preview versions'
    }
  })
} else if (command === 'verify') {
  verifyStagedArchives(resolve(location), expected)
  const info = JSON.parse(readFileSync(join(location, 'build-info.json'), 'utf8'))
  if (
    info.fingerprint !== plan.fingerprint ||
    info.compositionTree !== plan.result.tree ||
    info.configurationCommit !== plan.configuration
  ) {
    throw new Error('Package provenance differs from the planned composition')
  }
  writeFileSync(
    join(location, 'verified.json'),
    JSON.stringify(
      { ...expected, tree: plan.result.tree, fingerprint: plan.fingerprint, verified: true },
      null,
      2
    )
  )
} else {
  throw new Error('Unknown package operation')
}
