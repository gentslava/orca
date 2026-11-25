import { app } from 'electron'
import type { ReleaseBuild, ReleaseChannel } from '../../../shared/updater/release-channel'
import type { UpdateCheckOptions, UpdateStatus } from '../../../shared/updater/update-status-types'
import type { ReleaseBuildListOptions } from '../releases/updater-release-build-cache'
import { UpdaterDownloadInstall } from './updater-download-install'
import type { UpdateInstallTrigger } from './updater-state'

function isForkPreviewBuild(): boolean {
  return /(?:-|\.)local\.forkpreview\.\d+\.[0-9a-f]{1,12}$/.test(app.getVersion())
}

export class UpdaterForkPreviewGuard extends UpdaterDownloadInstall {
  protected rejectForkPreviewUpdate(userInitiated = false): boolean {
    if (!isForkPreviewBuild()) {
      return false
    }
    this.sendStatus({ state: 'not-available', userInitiated })
    return true
  }

  checkForUpdates(): void {
    if (this.rejectForkPreviewUpdate()) {
      return
    }
    this.checkForUpdatesInBackground()
  }

  checkForUpdatesFromMenu(options?: UpdateCheckOptions): void {
    if (this.rejectForkPreviewUpdate(true)) {
      return
    }
    super.checkForUpdatesFromMenu(options)
  }

  downloadUpdate(automatic = false): void {
    if (this.rejectForkPreviewUpdate(!automatic)) {
      return
    }
    super.downloadUpdate(automatic)
  }

  applyAutomaticUpdatesSetting(): void {
    if (this.rejectForkPreviewUpdate()) {
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
    if (this.rejectForkPreviewUpdate(trigger === 'manual')) {
      return
    }
    super.quitAndInstall(trigger, isCurrentTeamRestart)
  }

  getUpdateStatus(): UpdateStatus {
    if (isForkPreviewBuild()) {
      return { state: 'not-available' }
    }
    return super.getUpdateStatus()
  }

  async listAvailableReleaseBuilds(
    channel: ReleaseChannel,
    options?: ReleaseBuildListOptions
  ): Promise<ReleaseBuild[]> {
    if (this.rejectForkPreviewUpdate(true)) {
      return []
    }
    return super.listAvailableReleaseBuilds(channel, options)
  }
}
