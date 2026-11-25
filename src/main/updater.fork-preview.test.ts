import { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdaterSetup } from './updater/lifecycle/updater-setup'

const mocks = vi.hoisted(() => {
  const autoUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    autoRunAppAfterInstall: true,
    allowPrerelease: false,
    allowDowngrade: false,
    disableDifferentialDownload: false,
    on: vi.fn(),
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn().mockResolvedValue(null),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn()
  }
  return {
    autoUpdater,
    version: vi.fn(() => '1.4.214'),
    load: vi.fn(() => autoUpdater),
    list: vi.fn().mockResolvedValue([]),
    resolve: vi.fn(),
    nudge: vi.fn().mockResolvedValue(null),
    choose: vi.fn(),
    fetch: vi.fn(),
    downloadURL: vi.fn(),
    send: vi.fn()
  }
})
vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: mocks.version, on: vi.fn(), prependListener: vi.fn() },
  BrowserWindow: class {
    static getAllWindows() {
      return []
    }

    isDestroyed() {
      return false
    }

    webContents = { isDestroyed: () => false, downloadURL: mocks.downloadURL, send: mocks.send }
  },
  autoUpdater: { on: vi.fn() },
  powerMonitor: { on: vi.fn() },
  shell: { showItemInFolder: vi.fn() },
  net: { fetch: mocks.fetch }
}))
vi.mock('./updater/electron-updater-loader', () => ({ loadElectronAutoUpdater: mocks.load }))
vi.mock('./updater/updater-lifecycle-diagnostics', () => ({ recordUpdaterLifecycle: vi.fn() }))
vi.mock('./updater/mac-install/macos-shipit-scheduling', () => ({
  configureMacShipItScheduling: vi.fn()
}))
vi.mock('./updater/linux-package/linux-update-package-type', () => ({
  getLinuxPackageType: () => 'deb',
  getLinuxRootPackageType: () => 'deb',
  isExternallyManagedLinuxInstall: () => false
}))
vi.mock('./updater/nudges/nudge-campaign', () => ({
  fetchNudge: mocks.nudge,
  shouldApplyNudge: () => false
}))
vi.mock('./updater/releases/updater-release-builds', () => ({
  listReleaseBuilds: mocks.list,
  resolveTargetBuild: mocks.resolve
}))
vi.mock('./local-builds/local-build-switch', () => ({ chooseLocalBuild: mocks.choose }))

let updater: UpdaterSetup
const hostPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
const hostArch = Object.getOwnPropertyDescriptor(process, 'arch')
const lastCheckAt = 1_700_000_000_000
beforeEach(async () => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(lastCheckAt)
  const { UpdaterSetup } = await import('./updater/lifecycle/updater-setup')
  updater = new UpdaterSetup()
})
afterEach(() => {
  if (hostPlatform) {
    Object.defineProperty(process, 'platform', hostPlatform)
  }
  if (hostArch) {
    Object.defineProperty(process, 'arch', hostArch)
  }
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('fork preview updater isolation', () => {
  it.each([
    '1.4.214-local.forkpreview.123456.abcdef',
    '1.4.255-local.forkpreview.123456.abcdef',
    '1.4.214-rc.1.local.forkpreview.123456.abcdef'
  ])('blocks setup and every public self-update entry point for %s', async (version) => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    mocks.version.mockReturnValue(version)
    expect(updater.getUpdateStatus()).toEqual({ state: 'not-available' })
    updater.setupAutoUpdater(null)
    updater.checkForUpdates()
    updater.checkForUpdatesFromMenu()
    updater.checkForUpdatesFromMenu({ localBuild: true })
    updater.checkForUpdatesFromMenu({ channel: 'stable', targetTag: 'v1.4.215' })
    updater.downloadUpdate()
    updater.quitAndInstall()
    expect(await updater.listAvailableReleaseBuilds('stable', { force: true })).toEqual([])
    expect(await updater.listAvailableReleaseBuilds('hourly')).toEqual([])
    expect(updater.getUpdateStatus()).toEqual({ state: 'not-available' })
    expect(mocks.load).not.toHaveBeenCalled()
    expect(mocks.nudge).not.toHaveBeenCalled()
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.resolve).not.toHaveBeenCalled()
    expect(mocks.choose).not.toHaveBeenCalled()
    expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(mocks.autoUpdater.downloadUpdate).not.toHaveBeenCalled()
    expect(mocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    expect(updater.isQuittingForUpdate()).toBe(false)
  })

  it.each([
    '1.4.214',
    '1.4.214-rc.1',
    '1.4.214-hourly.202610251200',
    '1.4.214-daily.20261025',
    '1.4.214-adhoc.123456.abcdef',
    '1.4.214-local.123456.abcdef'
  ])('preserves normal updater setup and release lookup for %s', async (version) => {
    mocks.version.mockReturnValue(version)
    updater.setupAutoUpdater(null, { getLastUpdateCheckAt: () => lastCheckAt })
    await updater.listAvailableReleaseBuilds('stable', { force: true })
    expect(mocks.load).toHaveBeenCalledOnce()
    expect(mocks.autoUpdater.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://github.com/stablyai/orca/releases/latest/download'
    })
    expect(mocks.list).toHaveBeenCalledWith('stable')
    expect(updater.getUpdateStatus()).toEqual({ state: 'idle' })
  })
})

describe.runIf(process.env.ORCA_TEST_COMPOSED_FORK_UPDATER === '1')('macOS fork updates', () => {
  const version = '1.4.215-local.forkpreview.123456.abcdef123456'
  const tag = 'personal-1234-1'
  const page = `https://github.com/gentslava/orca/releases/tag/${tag}`
  const download = `https://github.com/gentslava/orca/releases/download/${tag}`
  const offerRelease = (signed: boolean) => {
    const releaseVersion = signed ? version.replace('-local.', '-signed.local.') : version
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          tag_name: tag,
          draft: false,
          published_at: new Date(lastCheckAt).toISOString(),
          assets: [
            `Orca-${releaseVersion}-arm64-mac.zip`,
            'orca-macos-arm64.dmg',
            'release-verification.json',
            ...(signed ? ['latest-mac.yml'] : [])
          ].map((name) => ({
            name,
            state: 'uploaded',
            browser_download_url: `${download}/${name}`
          }))
        }
      ]
    })
  }

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    Object.defineProperty(process, 'arch', { value: 'arm64' })
    mocks.version.mockReturnValue('1.4.214-local.forkpreview.123455.abcdef123456')
  })

  it('checks automatically and downloads the DMG on request without initializing native install', async () => {
    offerRelease(false)
    updater.setupAutoUpdater(new BrowserWindow({ show: false }))
    await vi.advanceTimersByTimeAsync(0)
    expect(updater.getUpdateStatus()).toMatchObject({
      state: 'available',
      version,
      releaseUrl: page,
      manualDownloadUrl: `${download}/orca-macos-arm64.dmg`
    })
    updater.downloadUpdate(true)
    expect(mocks.downloadURL).not.toHaveBeenCalled()
    updater.downloadUpdate()
    expect(mocks.downloadURL).toHaveBeenCalledExactlyOnceWith(`${download}/orca-macos-arm64.dmg`)
    updater.quitAndInstall()
    expect(mocks.load).not.toHaveBeenCalled()
    expect(mocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('pins the native updater to a signed fork tag and ignores alternate upstream selectors', async () => {
    mocks.version.mockReturnValue('1.4.214-signed.local.forkpreview.123455.abcdef123456')
    offerRelease(true)
    updater.setupAutoUpdater(null, { getLastUpdateCheckAt: () => lastCheckAt })
    updater.checkForUpdatesFromMenu({ channel: 'stable', targetTag: 'v1.4.300' })
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.autoUpdater.setFeedURL).toHaveBeenCalledExactlyOnceWith({
      provider: 'generic',
      url: download
    })
    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledOnce()
    expect(mocks.resolve).not.toHaveBeenCalled()
    expect(mocks.nudge).not.toHaveBeenCalled()
  })
})
