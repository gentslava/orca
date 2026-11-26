import Constants from 'expo-constants'
import * as Linking from 'expo-linking'
import { useSyncExternalStore } from 'react'
import { AppState, Platform } from 'react-native'
import { OrcaPlayStorePresence } from '../../modules/orca-play-store-presence/src'
import {
  loadAppUpdatePreferences,
  saveAppUpdateCheck,
  saveDismissedAppUpdateVersion
} from '../storage/app-update-preferences'
import { appStoreUpdateSource } from './app-store-update-source'
import { createAppUpdateChecker, type AppUpdateState } from './app-update-checker'
import type { AppUpdateSource } from './app-update-source'
import {
  createForkAndroidUpdateSource,
  FORK_RELEASES_URL,
  forkAndroidBuildTimestamp
} from './fork-android-update-source'
import {
  ANDROID_RELEASE_TAG_PREFIX,
  createGithubReleaseUpdateSource,
  RETIRED_ANDROID_RELEASE_TAG_PREFIX
} from './github-release-update-source'

// expoConfig is embedded binary manifest because app does not use expo-updates; SDK 55 removed nativeAppVersion. Revisit version source if adopting OTA updates.
export const installedAppVersion: string | null = Constants.expoConfig?.version ?? null

/** The GitHub APK's package. Orca moved to Google Play as dev.orca.app, so this app gets no more updates. */
export const isRetiredGithubAndroidApp =
  Platform.OS === 'android' && Constants.expoConfig?.android?.package === 'com.stably.orca.mobile'

/** Play delivers this install's updates and forbids other update channels. */
export const isGooglePlayInstall =
  Platform.OS === 'android' && (OrcaPlayStorePresence?.isInstalledByPlayStore() ?? false)

const androidConfig = Constants.expoConfig?.android
const forkAndroidTimestamp = forkAndroidBuildTimestamp(
  Constants.expoConfig?.extra?.orcaForkAndroidBuild
)
const forkAndroidBuild =
  Platform.OS === 'android' &&
  !isGooglePlayInstall &&
  forkAndroidTimestamp !== null &&
  androidConfig?.package &&
  androidConfig.versionCode
    ? {
        applicationId: androidConfig.package,
        versionCode: androidConfig.versionCode,
        timestamp: forkAndroidTimestamp
      }
    : null

const preferencesChannel = forkAndroidBuild ? 'fork-android' : undefined

export const forkUpdateReleasesUrl = forkAndroidBuild ? FORK_RELEASES_URL : null

/** The channel that installed this binary. */
function resolveAppUpdateSource(): AppUpdateSource | null {
  if (Platform.OS === 'android') {
    if (isGooglePlayInstall) {
      return null
    }
    if (forkAndroidBuild) {
      return createForkAndroidUpdateSource((input, init) => fetch(input, init), forkAndroidBuild)
    }
    return createGithubReleaseUpdateSource(
      (input, init) => fetch(input, init),
      isRetiredGithubAndroidApp ? RETIRED_ANDROID_RELEASE_TAG_PREFIX : ANDROID_RELEASE_TAG_PREFIX
    )
  }
  if (Platform.OS === 'ios') {
    return appStoreUpdateSource
  }
  return null
}

const appUpdateSource = resolveAppUpdateSource()

/** False where no channel can be asked, so there is nothing to check by hand. */
export const canCheckForAppUpdates = appUpdateSource !== null

export const appUpdateChecker = createAppUpdateChecker({
  source: appUpdateSource,
  installedVersion: installedAppVersion,
  now: () => Date.now(),
  setTimer: (run, delayMs) => setTimeout(run, delayMs),
  clearTimer: (handle) => clearTimeout(handle),
  subscribeForeground: (onForeground) => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        onForeground()
      }
    })
    return () => subscription.remove()
  },
  loadPreferences: () => loadAppUpdatePreferences(preferencesChannel),
  saveCheck: (checkedAt, latest) => saveAppUpdateCheck(checkedAt, latest, preferencesChannel),
  saveDismissedVersion: (version) => saveDismissedAppUpdateVersion(version, preferencesChannel)
})

export function useAppUpdateState(): AppUpdateState {
  return useSyncExternalStore(appUpdateChecker.subscribe, appUpdateChecker.getSnapshot)
}

/** Opens the update the check found: the GitHub release (Android) or App Store (iOS). */
export function openAppUpdate(url: string): void {
  void Linking.openURL(url).catch(() => {})
}
