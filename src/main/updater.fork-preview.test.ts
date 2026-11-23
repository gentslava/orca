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
    choose: vi.fn()
  }
})
vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: mocks.version, on: vi.fn(), prependListener: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  autoUpdater: { on: vi.fn() },
  powerMonitor: { on: vi.fn() },
  shell: { showItemInFolder: vi.fn() },
  net: { fetch: vi.fn() }
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
const lastCheckAt = 1_700_000_000_000
beforeEach(async () => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(lastCheckAt)
  const { UpdaterSetup } = await import('./updater/lifecycle/updater-setup')
  updater = new UpdaterSetup()
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('fork preview updater isolation', () => {
  it.each([
    '1.4.214-local.forkpreview.123456.abcdef',
    '1.4.255-local.forkpreview.123456.abcdef',
    '1.4.214-rc.1.local.forkpreview.123456.abcdef'
  ])('blocks setup and every public self-update entry point for %s', async (version) => {
    mocks.version.mockReturnValue(version)
    expect(updater.getUpdateStatus()).toEqual({ state: 'not-available' })
    const onTeamUpdatePolicyChanged = vi.fn()
    updater.setupAutoUpdater(null, { onTeamUpdatePolicyChanged })
    updater.checkForUpdates()
    updater.checkForUpdatesFromMenu()
    updater.checkForUpdatesFromMenu({ localBuild: true })
    updater.checkForUpdatesFromMenu({ channel: 'stable', targetTag: 'v1.4.215' })
    updater.downloadUpdate()
    updater.quitAndInstall()
    updater.quitAndInstall('team-policy', () => true)
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
    expect(onTeamUpdatePolicyChanged).not.toHaveBeenCalled()
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
