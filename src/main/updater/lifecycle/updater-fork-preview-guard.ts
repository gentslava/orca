import { app } from 'electron'
import { updateDelayDaysToMs } from '../../../shared/updater/update-delay'
import {
  applyReleaseDelay,
  toDelayedUpdate,
  type DatedReleaseTag
} from '../releases/updater-release-delay'
import {
  fetchForkMacReleases,
  forkMacDmg,
  isForkMacBuild,
  forkReleaseDownloadUrl,
  forkReleasePage,
  isForkMacUpdateBuild,
  isPersonalForkBuild
} from '../releases/updater-fork-release-feed'
import type { ReleaseBuild, ReleaseChannel } from '../../../shared/updater/release-channel'
import type { UpdateCheckOptions, UpdateStatus } from '../../../shared/updater/update-status-types'
import type { ReleaseBuildListOptions } from '../releases/updater-release-build-cache'
import { UpdaterDownloadInstall } from './updater-download-install'
import { AUTO_UPDATE_CHECK_INTERVAL_MS, type UpdateInstallTrigger } from './updater-state'
import type { UpdateCheckVariant } from './updater-types'

export class UpdaterForkPreviewGuard extends UpdaterDownloadInstall {
  private forkReleaseUrl: string | undefined

  protected usesForkPreviewDownload(): boolean {
    return isForkMacBuild() && !isForkMacUpdateBuild()
  }

  private async findForkRelease(
    attempt: number | null,
    requireSigned: boolean,
    ignoreDelay: boolean
  ): Promise<DatedReleaseTag | undefined> {
    const version = app.getVersion()
    const delayDays = ignoreDelay ? 0 : (this.getUpdateDelayDays?.() ?? 0)
    const releases = await fetchForkMacReleases(version, requireSigned)
    if (attempt === null || !this.isActiveUpdateCheckAttempt(attempt)) {
      return undefined
    }
    const { eligible, releaseDelay } =
      delayDays > 0
        ? applyReleaseDelay(releases, releases, version, updateDelayDaysToMs(delayDays), Date.now())
        : { eligible: releases, releaseDelay: null }
    this.delayedUpdate = toDelayedUpdate(releaseDelay?.heldRelease, delayDays)
    return eligible[0]
  }

  protected override runBackgroundUpdateCheck(nudgeId?: string | null): boolean {
    return this.usesForkPreviewDownload()
      ? this.checkForkPreview(false)
      : super.runBackgroundUpdateCheck(nudgeId)
  }

  private checkForkPreview(userInitiated: boolean, ignoreDelay = false): boolean {
    if (userInitiated) {
      this.userInitiatedCheck = true
    }
    if (this.currentStatus.state === 'checking') {
      if (userInitiated) {
        this.sendStatus({ state: 'checking', userInitiated: true })
      }
      return false
    }
    const attempt = this.beginUpdateCheckAttempt()
    this.sendStatus({ state: 'checking', userInitiated })
    void this.findForkRelease(attempt, false, ignoreDelay)
      .then((release) => {
        if (!this.isActiveUpdateCheckAttempt(attempt)) {
          return
        }
        this.scheduleAutomaticUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS)
        if (!release) {
          this.settleHeldUpdateCheck(attempt)
          return
        }
        this.userInitiatedCheck = false
        this.recordCompletedUpdateCheck()
        this.sendSettledCheckStatus({
          state: 'available',
          version: release.version,
          releaseUrl: forkReleasePage(release.tag),
          manualDownloadUrl: `${forkReleaseDownloadUrl(release.tag)}/${forkMacDmg}`,
          changelog: null
        })
      })
      .catch((error: unknown) => {
        if (this.isActiveUpdateCheckAttempt(attempt)) {
          const wasUserInitiated = this.userInitiatedCheck
          this.userInitiatedCheck = false
          void this.sendCheckFailureStatus(String(error), wasUserInitiated, 'promise', error)
        }
      })
    return true
  }

  protected override async pinDefaultReleaseFeed(
    variant: UpdateCheckVariant = 'default'
  ): Promise<'ready' | 'not-available'> {
    if (!isForkMacUpdateBuild()) {
      return super.pinDefaultReleaseFeed(variant)
    }
    const ignoreDelay = this.ignoreUpdateDelayOnce
    this.ignoreUpdateDelayOnce = false
    const release = await this.findForkRelease(this.activeUpdateCheckAttemptId, true, ignoreDelay)
    if (!release) {
      return 'not-available'
    }
    const updater = this.getAutoUpdater()
    updater.allowDowngrade = false
    updater.allowPrerelease = true
    updater.disableDifferentialDownload = true
    updater.setFeedURL({ provider: 'generic', url: forkReleaseDownloadUrl(release.tag) })
    this.forkReleaseUrl = forkReleasePage(release.tag)
    return 'ready'
  }

  protected override getKnownReleaseUrl(): string | undefined {
    return this.forkReleaseUrl ?? super.getKnownReleaseUrl()
  }

  protected rejectForkPreviewUpdate(userInitiated = false): boolean {
    if (!isPersonalForkBuild() || isForkMacUpdateBuild()) {
      return false
    }
    this.sendStatus({ state: 'not-available', userInitiated })
    return true
  }

  checkForUpdates(): void {
    if (!this.usesForkPreviewDownload() && this.rejectForkPreviewUpdate()) {
      return
    }
    this.checkForUpdatesInBackground()
  }

  checkForUpdatesFromMenu(options?: UpdateCheckOptions): void {
    if (this.usesForkPreviewDownload()) {
      this.checkForkPreview(true, options?.ignoreUpdateDelay)
      return
    }
    if (this.rejectForkPreviewUpdate(true)) {
      return
    }
    super.checkForUpdatesFromMenu(
      isForkMacUpdateBuild() ? { ignoreUpdateDelay: options?.ignoreUpdateDelay } : options
    )
  }

  downloadUpdate(automatic = false): void {
    if (this.usesForkPreviewDownload()) {
      const status = this.currentStatus
      if (!automatic && status.state === 'available' && status.manualDownloadUrl) {
        const window = this.getMainWindow()
        if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
          window.webContents.downloadURL(status.manualDownloadUrl)
        }
      }
      return
    }
    if (this.rejectForkPreviewUpdate(!automatic)) {
      return
    }
    super.downloadUpdate(automatic)
  }

  applyAutomaticUpdatesSetting(): void {
    if (this.usesForkPreviewDownload() || this.rejectForkPreviewUpdate()) {
      return
    }
    if (this.currentStatus.state === 'downloaded' && !this.currentStatus.installing) {
      this.publishDownloadStatus(this.currentStatus)
    } else {
      this.downloadAvailableUpdateAutomatically()
    }
  }

  override quitAndInstall(
    trigger: UpdateInstallTrigger = 'manual',
    isCurrentTeamRestart?: () => boolean
  ): void {
    if (this.usesForkPreviewDownload() || this.rejectForkPreviewUpdate(trigger === 'manual')) {
      return
    }
    super.quitAndInstall(trigger, isCurrentTeamRestart)
  }

  getUpdateStatus(): UpdateStatus {
    if (isPersonalForkBuild() && !isForkMacBuild()) {
      return { state: 'not-available' }
    }
    return super.getUpdateStatus()
  }

  async listAvailableReleaseBuilds(
    channel: ReleaseChannel,
    options?: ReleaseBuildListOptions
  ): Promise<ReleaseBuild[]> {
    if (isPersonalForkBuild()) {
      return []
    }
    return super.listAvailableReleaseBuilds(channel, options)
  }
}
