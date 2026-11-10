import { STABLE_DESKTOP_RELEASE_TAG } from '../scripts/release/versioning/stable-release-tags.mjs'

export function upstreamReleaseIdentity(release) {
  if (
    release?.draft !== false ||
    release.prerelease !== false ||
    typeof release.tag_name !== 'string' ||
    !STABLE_DESKTOP_RELEASE_TAG.test(release.tag_name) ||
    !Number.isSafeInteger(release.id) ||
    release.id < 1 ||
    typeof release.published_at !== 'string' ||
    !Number.isFinite(Date.parse(release.published_at))
  ) {
    throw new Error('A published stable upstream release is required for the personal version')
  }
  const parts = release.tag_name.slice(1).split('.').map(Number)
  if (!parts.every(Number.isSafeInteger) || !Number.isSafeInteger(parts[2] + 1)) {
    throw new Error('Upstream release version exceeds the supported numeric range')
  }
  parts[2]++
  return {
    id: release.id,
    tag: release.tag_name,
    publishedAt: release.published_at,
    baseVersion: parts.join('.')
  }
}
