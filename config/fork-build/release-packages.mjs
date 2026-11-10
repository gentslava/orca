import { copyFileSync, readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { join } from 'node:path'
import {
  packageIdentity,
  assertIdentity,
  verifyPackageReceipt,
  writeJson
} from './package-provenance.mjs'

export function assembleReleasePackages(plan, directory, windows, android) {
  const outputs = [
    'macos-arm64-dmg',
    'macos-arm64-zip',
    'windows-x64-installer',
    'windows-x64-zip',
    'android-apk'
  ]
  if (!isDeepStrictEqual(plan.outputs, outputs)) {
    throw new Error('The release requires all five package formats')
  }
  const platforms = [
    {
      name: 'windows',
      directory: windows,
      platform: 'win32',
      architecture: 'x64',
      files: ['orca-windows-setup.exe', 'orca-windows-x64.zip']
    },
    {
      name: 'android',
      directory: android,
      platform: 'android',
      architecture: 'universal',
      files: ['orca-android.apk']
    }
  ]
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
    platforms: ['macos-arm64', 'windows-x64', 'android'],
    verified: true,
    receipts: verified.map(({ identity }) => identity)
  })
}
