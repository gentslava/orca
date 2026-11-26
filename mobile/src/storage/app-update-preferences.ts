import AsyncStorage from '@react-native-async-storage/async-storage'
import * as z from 'zod'

type UpdateChannel = 'fork-android'

function preferenceKeys(channel?: UpdateChannel) {
  const prefix = channel ? `orca:appUpdate:${channel}` : 'orca:appUpdate'
  return {
    checkedAt: `${prefix}:lastCheckedAt`,
    latest: `${prefix}:latest`,
    dismissed: `${prefix}:dismissedVersion`
  }
}

export type KnownAppUpdate = {
  readonly version: string
  readonly url: string
  readonly revision?: string
}

export type AppUpdatePreferences = {
  readonly lastCheckedAt: number | null
  readonly latest: KnownAppUpdate | null
  readonly dismissedVersion: string | null
}

export const EMPTY_APP_UPDATE_PREFERENCES: AppUpdatePreferences = {
  lastCheckedAt: null,
  latest: null,
  dismissedVersion: null
}

const knownAppUpdateSchema = z.object({
  version: z.string(),
  url: z.string(),
  revision: z.string().optional()
})

// Discard only the corrupt field; preserve adjacent check and dismissal state.
function parseLatest(raw: string | null): KnownAppUpdate | null {
  try {
    const parsed = raw ? knownAppUpdateSchema.safeParse(JSON.parse(raw)) : null
    return parsed?.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function loadAppUpdatePreferences(
  channel?: UpdateChannel
): Promise<AppUpdatePreferences> {
  const keys = preferenceKeys(channel)
  try {
    const [[, checkedAt], [, latest], [, dismissed]] = await AsyncStorage.multiGet([
      keys.checkedAt,
      keys.latest,
      keys.dismissed
    ])
    const lastCheckedAt = checkedAt === null ? null : Number(checkedAt)
    return {
      lastCheckedAt:
        lastCheckedAt !== null && Number.isFinite(lastCheckedAt) ? lastCheckedAt : null,
      latest: parseLatest(latest),
      dismissedVersion: dismissed
    }
  } catch {
    return EMPTY_APP_UPDATE_PREFERENCES
  }
}

export async function saveAppUpdateCheck(
  checkedAt: number,
  latest: KnownAppUpdate | null,
  channel?: UpdateChannel
) {
  const keys = preferenceKeys(channel)
  await AsyncStorage.multiSet([
    [keys.checkedAt, String(checkedAt)],
    [keys.latest, latest ? JSON.stringify(latest) : '']
  ])
}

export async function saveDismissedAppUpdateVersion(
  version: string,
  channel?: UpdateChannel
): Promise<void> {
  await AsyncStorage.setItem(preferenceKeys(channel).dismissed, version)
}

const KEPT_RETIRED_APP_AT_KEY = 'orca:appUpdate:keptRetiredAppAt'

/** When the person last chose to keep the retired GitHub app, or null. */
export async function loadKeptRetiredAppAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(KEPT_RETIRED_APP_AT_KEY)
    const keptAt = raw === null ? null : Number(raw)
    return keptAt !== null && Number.isFinite(keptAt) ? keptAt : null
  } catch {
    return null
  }
}

export async function saveKeptRetiredAppAt(keptAt: number): Promise<void> {
  await AsyncStorage.setItem(KEPT_RETIRED_APP_AT_KEY, String(keptAt))
}
