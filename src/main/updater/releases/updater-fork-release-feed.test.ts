import { describe, expect, it, vi } from 'vitest'
import { fetchForkMacReleases, parseForkMacReleases } from './updater-fork-release-feed'

const fetch = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ app: {}, net: { fetch } }))

const installed = '1.4.275-local.forkpreview.102.abcdef123456'
const timestamp = '2026-11-25T00:00:00.000Z'

function release(tag: string, version: string, { manifest = true, draft = false } = {}) {
  return {
    tag_name: tag,
    draft,
    prerelease: true,
    published_at: timestamp,
    assets: [`Orca-${version}-arm64-mac.zip`, ...(manifest ? ['latest-mac.yml'] : [])].map(
      (name) => ({
        name,
        state: 'uploaded',
        browser_download_url: `https://github.com/gentslava/orca/releases/download/${tag}/${name}`
      })
    )
  }
}

describe('fork macOS update feed', () => {
  it('selects only published newer fork releases with a manifest and matching ARM64 ZIP', () => {
    const newer = '1.4.275-signed.local.forkpreview.103.abcdef123456'
    const newest = '1.4.276-signed.local.forkpreview.104.abcdef123456'
    const foreign = release('personal-1235-1', newest)
    foreign.assets[0].browser_download_url = foreign.assets[0].browser_download_url.replace(
      'gentslava',
      'stablyai'
    )
    expect(
      parseForkMacReleases(
        [
          release('personal-1233-1', installed),
          release('personal-1234-1', newest, { manifest: false }),
          foreign,
          release('personal-1236-1', newest, { draft: true }),
          release('v1.4.276', newest),
          release('personal-1237-1', newer),
          release('personal-1238-1', newest)
        ],
        installed
      )
    ).toEqual([
      { tag: 'personal-1238-1', version: newest, releasedAt: Date.parse(timestamp) },
      { tag: 'personal-1237-1', version: newer, releasedAt: Date.parse(timestamp) }
    ])
  })

  it('uses the fork only and handles GitHub failures without falling back to upstream', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 503 })
    await expect(fetchForkMacReleases(installed)).rejects.toThrow('HTTP 503')
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://api.github.com/repos/gentslava/orca/releases?per_page=100',
      expect.objectContaining({ redirect: 'error' })
    )
  })
})
