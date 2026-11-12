import { copyFileSync, readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { join } from 'node:path'
import {
  packageIdentity,
  assertIdentity,
  verifyPackageReceipt,
  writeJson
} from './package-provenance.mjs'
import { packageTargets } from './package-targets.mjs'

export function assembleReleasePackages(plan, directory, windows, android, linux) {
  const targets = packageTargets(plan.outputs)
  if (!isDeepStrictEqual(plan.targets, targets)) {
    throw new Error('Release target matrix differs from the frozen source plan')
  }
  const platforms = targets
    .filter((target) => target.platform !== 'darwin')
    .map((target) => ({
      ...target,
      name: target.receipt ?? target.id,
      directory:
        target.platform === 'win32'
          ? windows
          : target.platform === 'android'
            ? android
            : join(linux, target.id)
    }))
  const verified = []
  for (const platform of platforms) {
    const receiptName = `${platform.name}-verified.json`
    const receipt = JSON.parse(readFileSync(join(platform.directory, receiptName), 'utf8'))
    assertIdentity(
      receipt.identity,
      packageIdentity(plan, platform.platform, platform.architecture)
    )
    if (
      !receipt.verified ||
      JSON.stringify(receipt.files.map(({ file }) => file)) !== JSON.stringify(platform.files)
    ) {
      throw new Error('Every required platform must be independently verified before publication')
    }
    const expected = packageIdentity(plan, platform.platform, platform.architecture)
    if (platform.name === 'android') {
      Object.assign(expected, plan.mobile)
    }
    const proof = verifyPackageReceipt(platform.directory, platform.name, expected)
    if (!isDeepStrictEqual(receipt, { ...proof, verified: true })) {
      throw new Error('Platform metadata differs from its independent verification receipt')
    }
    for (const file of [
      ...platform.files,
      receiptName,
      `${platform.name}-build-info.json`,
      `${platform.name}-SHA256SUMS`
    ]) {
      copyFileSync(join(platform.directory, file), join(directory, file))
    }
    verified.push(receipt)
  }
  const mac = JSON.parse(readFileSync(join(directory, 'verified.json'), 'utf8'))
  if (!mac.verified || mac.commit !== plan.result.commit || mac.fingerprint !== plan.fingerprint) {
    throw new Error('macOS verification differs from the shared source plan')
  }
  writeJson(join(directory, 'release-verification.json'), {
    commit: plan.result.commit,
    upstream: plan.upstream,
    fingerprint: plan.fingerprint,
    outputs: plan.outputs,
    platforms: targets.map((target) => target.id),
    verified: true,
    receipts: verified.map(({ identity }) => identity)
  })
}
