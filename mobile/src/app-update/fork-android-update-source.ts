import { z } from 'zod'
import { isValidAppVersion } from '../../../src/shared/app-lifecycle/identity/app-version'
import type { KnownAppUpdate } from '../storage/app-update-preferences'
import type { AppUpdateSource } from './app-update-source'

const REPO_API = 'https://api.github.com/repos/gentslava/orca'
export const FORK_RELEASES_URL = 'https://github.com/gentslava/orca/releases'
const EXPO_DEBUG_CERTIFICATE = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c'
const APK_NAME = 'orca-android.apk'
const RECEIPT_NAME = 'android-verified.json'
const PERSONAL_TAG = /^personal-[1-9]\d*-[1-9]\d*$/
const PERSONAL_BUILD = /[.-](?:signed\.)?local\.forkpreview\.([1-9]\d*)\.[a-f0-9]{1,12}$/
const UPDATE_REVISION = /^([1-9]\d*):([1-9]\d*)$/
const sha256 = z.string().regex(/^[a-f0-9]{64}$/)
const assetSchema = z.object({
  name: z.string(),
  state: z.string(),
  browser_download_url: z.string(),
  digest: z.string().nullish()
})
const releaseSchema = z.object({
  tag_name: z.string().regex(PERSONAL_TAG),
  draft: z.literal(false),
  prerelease: z.literal(true),
  published_at: z.iso.datetime(),
  target_commitish: z.string().regex(/^[a-f0-9]{40}$/),
  assets: z.array(assetSchema)
})
const receiptSchema = z.object({
  verified: z.literal(true),
  signing: z.literal('expo-debug'),
  identity: z.object({
    commit: z.string(),
    platform: z.literal('android'),
    architecture: z.literal('universal'),
    applicationId: z.string(),
    mobileVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    versionCode: z.int().positive(),
    version: z.string()
  }),
  apk: z.object({ sha256, certificateSha256: z.literal(EXPO_DEBUG_CERTIFICATE) })
})

export function forkAndroidBuildTimestamp(version: unknown): number | null {
  if (typeof version !== 'string' || !isValidAppVersion(version)) {
    return null
  }
  const timestamp = Number(PERSONAL_BUILD.exec(version)?.[1])
  return Number.isSafeInteger(timestamp) ? timestamp : null
}

type FetchRelease = (url: string, options: { signal: AbortSignal }) => Promise<Response>

type InstalledBuild = { applicationId: string; versionCode: number; timestamp: number }

export function createForkAndroidUpdateSource(
  fetchImpl: FetchRelease,
  installed: InstalledBuild
): AppUpdateSource {
  function isApplicable(update: KnownAppUpdate): boolean {
    const [, versionCode, timestamp] = UPDATE_REVISION.exec(update.revision ?? '') ?? []
    const code = Number(versionCode)
    const stamp = Number(timestamp)
    const path = update.url.slice(FORK_RELEASES_URL.length + '/download/'.length).split('/')
    return (
      update.url.startsWith(`${FORK_RELEASES_URL}/download/`) &&
      path.length === 2 &&
      PERSONAL_TAG.test(path[0]) &&
      path[1] === APK_NAME &&
      Number.isSafeInteger(code) &&
      code >= installed.versionCode &&
      Number.isSafeInteger(stamp) &&
      stamp > installed.timestamp
    )
  }

  return {
    isApplicable,
    async check(_, signal) {
      const response = await fetchImpl(`${REPO_API}/releases?per_page=20`, { signal })
      if (!response.ok) {
        throw new Error(`Fork Android releases HTTP ${response.status}`)
      }
      const releases = z
        .array(z.unknown())
        .parse(await response.json())
        .flatMap((entry) => {
          const parsed = releaseSchema.safeParse(entry)
          return parsed.success ? [parsed.data] : []
        })
        .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
      let probes = 0
      for (const release of releases) {
        const base = `${FORK_RELEASES_URL}/download/${release.tag_name}`
        const apk = release.assets.find(
          (asset) =>
            asset.name === APK_NAME &&
            asset.state === 'uploaded' &&
            asset.browser_download_url === `${base}/${APK_NAME}`
        )
        const receipt = release.assets.find(
          (asset) =>
            asset.name === RECEIPT_NAME &&
            asset.state === 'uploaded' &&
            asset.browser_download_url === `${base}/${RECEIPT_NAME}`
        )
        if (!apk?.digest || !receipt) {
          continue
        }
        if (++probes > 3) {
          break
        }
        const proof = await fetchImpl(receipt.browser_download_url, { signal })
        if (!proof.ok) {
          throw new Error(`Fork Android verification receipt HTTP ${proof.status}`)
        }
        const parsed = receiptSchema.safeParse(await proof.json())
        if (!parsed.success) {
          continue
        }
        const { identity } = parsed.data
        const timestamp = forkAndroidBuildTimestamp(identity.version)
        if (
          identity.commit !== release.target_commitish ||
          identity.applicationId !== installed.applicationId ||
          apk.digest !== `sha256:${parsed.data.apk.sha256}` ||
          timestamp === null
        ) {
          continue
        }
        const update = {
          version: identity.mobileVersion,
          revision: `${identity.versionCode}:${timestamp}`,
          url: apk.browser_download_url
        }
        // An older build can finish publishing late. Compare the packaged build identity.
        if (isApplicable(update)) {
          return { kind: 'available', ...update }
        }
        if (timestamp === installed.timestamp && identity.versionCode === installed.versionCode) {
          break
        }
      }
      return { kind: 'current' }
    }
  }
}
