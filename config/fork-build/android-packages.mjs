import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import {
  packageIdentity,
  assertIdentity,
  stagePackageFiles,
  verifyPackageReceipt,
  writeJson,
  writePackageReceipt
} from './package-provenance.mjs'
import { hashFile } from '../scripts/fork-upstream-archives.mjs'

const APK_FILE = 'orca-android.apk'
const EXPO_DEBUG_CERTIFICATE = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c'

function androidTool(name) {
  const tools = join(process.env.ANDROID_HOME || '', 'build-tools')
  const collator = new Intl.Collator(undefined, { numeric: true })
  const versions = readdirSync(tools)
    .filter((entry) => /^\d+(?:\.\d+)*$/.test(entry))
    .sort(collator.compare)
  if (!versions.length) {
    throw new Error('Android SDK build tools are unavailable')
  }
  return join(tools, versions.at(-1), name)
}

function run(program, args) {
  if (process.platform !== 'linux') {
    throw new Error('APK verification requires the Linux Android SDK runner')
  }
  return execFileSync(program, args, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true
  })
}

function androidIdentity(plan) {
  return { ...packageIdentity(plan, 'android', 'universal'), ...plan.mobile }
}

export function stampAndroidBuild(plan, application) {
  const assets = join(application, 'mobile/android/app/src/main/assets')
  mkdirSync(assets, { recursive: true })
  writeJson(join(assets, 'orca-personal-build.json'), androidIdentity(plan))
}

export function androidSigningCertificate(signerReport) {
  const certificates = signerReport
    .split(/\r?\n/)
    .filter((line) => line.includes('certificate SHA-256 digest:'))
  const certificate =
    certificates.length === 1
      ? /^(?:Signer #\d+|V2 Signer:) certificate SHA-256 digest: ([a-fA-F0-9]{64})$/
          .exec(certificates[0])?.[1]
          .toLowerCase()
      : null
  if (certificate !== EXPO_DEBUG_CERTIFICATE) {
    throw new Error(
      `Personal APK certificate differs from the existing Expo debug signing identity\n${signerReport}`
    )
  }
  return certificate
}

export function measureAndroidPackage(plan, file) {
  const identity = JSON.parse(run('unzip', ['-p', file, 'assets/orca-personal-build.json']))
  assertIdentity(identity, androidIdentity(plan))
  const badging = run(androidTool('aapt'), ['dump', 'badging', file])
  for (const [key, value] of [
    ['name', plan.mobile.applicationId],
    ['versionCode', String(plan.mobile.versionCode)],
    ['versionName', plan.mobile.mobileVersion]
  ]) {
    if (!badging.split('\n')[0].includes(`${key}='${value}'`)) {
      throw new Error('APK package/version differs from the committed mobile configuration')
    }
  }
  const signerReport = run(androidTool('apksigner'), ['verify', '--print-certs', file])
  const certificateSha256 = androidSigningCertificate(signerReport)
  const abis = [
    ...new Set(
      run('unzip', ['-Z1', file])
        .split('\n')
        .flatMap((name) => /^lib\/([^/]+)\/.+\.so$/.exec(name)?.[1] || [])
    )
  ].sort()
  if (!abis.includes('arm64-v8a')) {
    throw new Error('APK must contain Android ARM64 native libraries')
  }
  return { identity, sha256: hashFile(file), certificateSha256, abis }
}

export function stageAndroidPackage(plan, application) {
  const dist = join(application, 'mobile/android/app/build/outputs/apk/release')
  const files = readdirSync(dist).filter((name) => name.endsWith('.apk'))
  if (files.length !== 1) {
    throw new Error('Expected exactly one Android release APK')
  }
  const proof = measureAndroidPackage(plan, join(dist, files[0]))
  const directory = join(application, 'personal-packages')
  const records = stagePackageFiles(directory, dist, files)
  renameSync(join(directory, files[0]), join(directory, APK_FILE))
  records[0].file = APK_FILE
  writePackageReceipt(directory, 'android', {
    identity: proof.identity,
    files: records,
    apk: proof,
    signing: 'expo-debug'
  })
}

export function verifyAndroidPackage(plan, directory) {
  const proof = verifyPackageReceipt(directory, 'android', androidIdentity(plan))
  if (
    proof.files.length !== 1 ||
    proof.files[0].file !== APK_FILE ||
    JSON.stringify(measureAndroidPackage(plan, join(directory, APK_FILE))) !==
      JSON.stringify(proof.apk)
  ) {
    throw new Error('APK contents differ from their staged proof')
  }
  writeJson(join(directory, 'android-verified.json'), { ...proof, verified: true })
}
