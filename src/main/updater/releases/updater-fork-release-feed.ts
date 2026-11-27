import { app, net } from 'electron'
import { compareVersions, isValidVersion } from './updater-fallback'
import { FETCH_TIMEOUT_MS } from './updater-release-readiness'
import type { DatedReleaseTag } from './updater-release-delay'

const releasesUrl = 'https://github.com/gentslava/orca/releases'
const forkVersionSuffix = /[.-]local\.forkpreview\.\d+\.[0-9a-f]{1,12}$/
const signedForkVersionSuffix = /[.-]signed\.local\.forkpreview\.\d+\.[0-9a-f]{1,12}$/
const tagPattern = /^personal-[1-9]\d*-[1-9]\d*$/
const zipPattern = /^Orca-(.+)-arm64-mac\.zip$/

export function isPersonalForkBuild(): boolean {
  return forkVersionSuffix.test(app.getVersion())
}

export function isForkMacBuild(): boolean {
  return (
    app.isPackaged &&
    process.platform === 'darwin' &&
    process.arch === 'arm64' &&
    isPersonalForkBuild()
  )
}

export function isForkMacUpdateBuild(): boolean {
  return isForkMacBuild() && signedForkVersionSuffix.test(app.getVersion())
}

export function forkReleasePage(tag: string): string {
  return `${releasesUrl}/tag/${tag}`
}

export function forkReleaseDownloadUrl(tag: string): string {
  return `${releasesUrl}/download/${tag}`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export const forkMacDmg = 'orca-macos-arm64.dmg'

export function parseForkMacReleases(
  data: unknown,
  currentVersion: string,
  requireSigned = true
): DatedReleaseTag[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid GitHub fork release list')
  }
  const updates: DatedReleaseTag[] = []
  for (const entry of data) {
    if (
      !isObject(entry) ||
      entry.draft !== false ||
      typeof entry.tag_name !== 'string' ||
      !tagPattern.test(entry.tag_name) ||
      typeof entry.published_at !== 'string' ||
      !Array.isArray(entry.assets)
    ) {
      continue
    }
    const tag = entry.tag_name
    const releasedAt = Date.parse(entry.published_at)
    const assetBase = forkReleaseDownloadUrl(tag)
    const assets = entry.assets.flatMap((asset: unknown) => {
      if (
        !isObject(asset) ||
        typeof asset.name !== 'string' ||
        asset.state !== 'uploaded' ||
        asset.browser_download_url !== `${assetBase}/${asset.name}`
      ) {
        return []
      }
      return [asset.name]
    })
    const versions = assets.flatMap((name) => {
      const version = zipPattern.exec(name)?.[1]
      return version && forkVersionSuffix.test(version) && isValidVersion(version) ? [version] : []
    })
    if (
      !Number.isFinite(releasedAt) ||
      !assets.includes(requireSigned ? 'latest-mac.yml' : forkMacDmg) ||
      (requireSigned && !signedForkVersionSuffix.test(versions[0] ?? '')) ||
      (!requireSigned && !assets.includes('release-verification.json')) ||
      versions.length !== 1 ||
      compareVersions(versions[0], currentVersion) <= 0
    ) {
      continue
    }
    updates.push({ tag, version: versions[0], releasedAt })
  }
  return updates.sort((left, right) => compareVersions(right.version, left.version))
}

export async function fetchForkMacReleases(
  currentVersion: string,
  requireSigned = true
): Promise<DatedReleaseTag[]> {
  const response = await net.fetch(
    'https://api.github.com/repos/gentslava/orca/releases?per_page=100',
    {
      headers: { Accept: 'application/vnd.github+json' },
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    }
  )
  if (!response.ok) {
    throw new Error(`Fork release list returned HTTP ${response.status}`)
  }
  return parseForkMacReleases(await response.json(), currentVersion, requireSigned)
}
