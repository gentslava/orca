import { expect, it, vi } from 'vitest'
import { appUpdateId, createAppUpdateChecker, undismissedAppUpdate } from './app-update-checker'
import { createForkAndroidUpdateSource, FORK_RELEASES_URL } from './fork-android-update-source'

const stamp = 1795686711352
const applicationId = 'dev.orca.app'
const installed = { applicationId, versionCode: 34, timestamp: stamp }
const commit = 'a'.repeat(40)
const hash = 'b'.repeat(64)
const certificateSha256 = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c'
const tag = 'personal-45795845221-1'
const apkUrl = `${FORK_RELEASES_URL}/download/${tag}/orca-android.apk`
const receiptUrl = `${FORK_RELEASES_URL}/download/${tag}/android-verified.json`
const upstreamUrl = 'https://github.com/stablyai/orca/releases/tag/android-v0.0.71'
const signal = new AbortController().signal

function releaseFixture() {
  return {
    tag_name: tag,
    draft: false,
    prerelease: true,
    published_at: '2026-11-26T11:18:43Z',
    target_commitish: commit,
    assets: [
      {
        name: 'orca-android.apk',
        state: 'uploaded',
        browser_download_url: apkUrl,
        digest: `sha256:${hash}`
      },
      { name: 'android-verified.json', state: 'uploaded', browser_download_url: receiptUrl }
    ]
  }
}

function receiptFixture(timestamp: number, versionCode = 34) {
  return {
    verified: true,
    signing: 'expo-debug',
    identity: {
      platform: 'android',
      architecture: 'universal',
      commit,
      applicationId,
      mobileVersion: '0.0.70',
      versionCode,
      version: `1.4.278-local.forkpreview.${timestamp}.${commit.slice(0, 12)}`
    },
    apk: { sha256: hash, certificateSha256 }
  }
}

function mockGithub(entries: unknown[], receipt: unknown) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(entries))
    .mockResolvedValueOnce(Response.json(receipt))
}

it('offers the verified fork APK for a newer build even when the mobile version and code match', async () => {
  const request = mockGithub([releaseFixture()], receiptFixture(stamp + 1))
  await expect(
    createForkAndroidUpdateSource(request, installed).check('0.0.70', signal)
  ).resolves.toEqual({
    kind: 'available',
    version: '0.0.70',
    url: apkUrl,
    revision: `34:${stamp + 1}`
  })
  expect(request.mock.calls).toEqual([
    ['https://api.github.com/repos/gentslava/orca/releases?per_page=20', { signal }],
    [receiptUrl, { signal }]
  ])
})

it.each([
  ['the installed build', receiptFixture(stamp)],
  ['an older build published later', receiptFixture(stamp - 1)],
  ['an Android version code downgrade', receiptFixture(stamp + 1, 33)],
  [
    'a different Android signing key',
    { ...receiptFixture(stamp + 1), apk: { sha256: hash, certificateSha256: 'c'.repeat(64) } }
  ],
  [
    'a mismatched APK checksum',
    { ...receiptFixture(stamp + 1), apk: { sha256: 'd'.repeat(64), certificateSha256 } }
  ]
])('does not offer %s', async (_, receipt) => {
  const request = mockGithub([releaseFixture()], receipt)
  await expect(
    createForkAndroidUpdateSource(request, installed).check('0.0.70', signal)
  ).resolves.toEqual({
    kind: 'current'
  })
})

it('rejects drafts and downloads outside the pinned repository without fetching a receipt', async () => {
  const draft = { ...releaseFixture(), draft: true }
  const foreign = releaseFixture()
  foreign.assets[0].browser_download_url = upstreamUrl
  const request = mockGithub([draft, foreign], receiptFixture(stamp + 1))
  await expect(
    createForkAndroidUpdateSource(request, installed).check('0.0.70', signal)
  ).resolves.toEqual({
    kind: 'current'
  })
  expect(request).toHaveBeenCalledTimes(1)
})

it('hides cached upstream and just-installed updates while keeping a later rebuild visible', async () => {
  const checked = stamp + 100
  const stored = [
    [{ version: '0.0.71', url: upstreamUrl }, null],
    [{ version: '0.0.70', url: apkUrl, revision: `34:${stamp}` }, null],
    [{ version: '0.0.70', url: apkUrl, revision: `34:${stamp + 1}` }, `34:${stamp + 1}`]
  ] as const

  for (const [latest, availableId] of stored) {
    const loadPreferences = vi.fn(async () => ({
      latest,
      lastCheckedAt: checked,
      dismissedVersion: `34:${stamp}`
    }))
    const source = createForkAndroidUpdateSource(vi.fn<typeof fetch>(), installed)
    const checker = createAppUpdateChecker({
      source,
      installedVersion: '0.0.70',
      now: () => checked,
      setTimer: (callback, delay) => setTimeout(callback, delay),
      clearTimer: clearTimeout,
      subscribeForeground: () => () => {},
      loadPreferences,
      saveCheck: async () => {},
      saveDismissedVersion: async () => {}
    })

    const stop = checker.start()
    try {
      await vi.waitFor(() => expect(checker.getSnapshot().lastCheckedAt).toBe(checked))
      const update = undismissedAppUpdate(checker.getSnapshot())
      expect(update && appUpdateId(update)).toBe(availableId)
    } finally {
      stop()
    }
  }
})
