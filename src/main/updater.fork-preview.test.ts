import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from './updater-test-module-loader'

const {
  appMock,
  autoUpdaterMock,
  chooseLocalBuildMock,
  fetchNudgeMock,
  moduleFactories,
  resetUpdaterMocks,
  loadAutoUpdaterMock,
  listReleaseBuildsMock,
  resolveTargetBuildMock
} = await vi.hoisted(async () => {
  const mocks = (await import('./updater-test-harness')).createUpdaterMocks()
  return {
    ...mocks,
    loadAutoUpdaterMock: vi.fn(() => mocks.autoUpdaterMock),
    listReleaseBuildsMock: vi.fn().mockResolvedValue([]),
    resolveTargetBuildMock: vi.fn()
  }
})

vi.mock('electron', () => moduleFactories.electron())
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('./electron-updater-loader', () => ({ loadElectronAutoUpdater: loadAutoUpdaterMock }))
vi.mock('./ipc/pty/kill-all', () => moduleFactories.ptyKillAll())
vi.mock('./linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('./updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('./updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('./updater-nudge', () => moduleFactories.updaterNudge())
vi.mock('./update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('./updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('./local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('./local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())
vi.mock('./updater-release-builds', () => ({
  listReleaseBuilds: listReleaseBuildsMock,
  resolveTargetBuild: resolveTargetBuildMock
}))

warmUpdaterModule()
const lastCheckAt = 1_700_000_000_000

describe('fork preview updater isolation', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(lastCheckAt)
    resetUpdaterMocks()
    loadAutoUpdaterMock.mockClear()
    listReleaseBuildsMock.mockClear()
    resolveTargetBuildMock.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    '1.4.214-local.forkpreview.123456.abcdef',
    '1.4.214-rc.1.local.forkpreview.123456.abcdef'
  ])('blocks setup and every public self-update entry point for %s', async (version) => {
    appMock.getVersion.mockReturnValue(version)
    const updater = await loadUpdaterModule()

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
    expect(loadAutoUpdaterMock).not.toHaveBeenCalled()
    expect(fetchNudgeMock).not.toHaveBeenCalled()
    expect(listReleaseBuildsMock).not.toHaveBeenCalled()
    expect(resolveTargetBuildMock).not.toHaveBeenCalled()
    expect(chooseLocalBuildMock).not.toHaveBeenCalled()
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled()
    expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled()
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
    appMock.getVersion.mockReturnValue(version)
    const updater = await loadUpdaterModule()

    updater.setupAutoUpdater(null, { getLastUpdateCheckAt: () => lastCheckAt })
    await updater.listAvailableReleaseBuilds('stable', { force: true })

    expect(loadAutoUpdaterMock).toHaveBeenCalledOnce()
    expect(autoUpdaterMock.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://github.com/stablyai/orca/releases/latest/download'
    })
    expect(listReleaseBuildsMock).toHaveBeenCalledWith('stable')
    expect(updater.getUpdateStatus()).toEqual({ state: 'idle' })
  })
})
