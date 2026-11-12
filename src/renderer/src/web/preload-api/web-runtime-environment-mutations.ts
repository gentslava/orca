import { translate } from '@/i18n/i18n'
import {
  redactStoredWebRuntimeEnvironment,
  saveStoredWebRuntimeEnvironment
} from '../web-runtime-environment'
import {
  resolveEnvironment,
  webRuntimeState,
  removeActiveRuntimeEnvironment,
  manuallyDisconnectedEnvironmentIds
} from './web-runtime-session'

export function renameWebRuntimeEnvironment(selector: string, name: string) {
  const environment = resolveEnvironment(selector)
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error(
      translate(
        'auto.web.webPreloadApi.runtimeEnvironmentNameRequired',
        'A server name is required.'
      )
    )
  }
  if (trimmed === environment.name) {
    return { environment: redactStoredWebRuntimeEnvironment(environment) }
  }
  const next = { ...environment, name: trimmed, updatedAt: Date.now() }
  saveStoredWebRuntimeEnvironment(next)
  if (webRuntimeState.activeEnvironment?.id === environment.id) {
    webRuntimeState.activeEnvironment = next
  }
  return { environment: redactStoredWebRuntimeEnvironment(next) }
}

export function removeWebRuntimeEnvironment(selector: string) {
  const environment = resolveEnvironment(selector)
  if (webRuntimeState.activeEnvironment?.id === environment.id) {
    removeActiveRuntimeEnvironment()
  }
  manuallyDisconnectedEnvironmentIds.delete(environment.id)
  return { removed: redactStoredWebRuntimeEnvironment(environment) }
}
