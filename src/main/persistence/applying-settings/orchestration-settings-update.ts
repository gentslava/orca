import type { GlobalSettings } from '../../../shared/global-settings-types'
import { resolveNestedWorkerMaxDepth } from '../../../shared/nested-worker-depth'
import { parseWorkerRoleProfiles } from '../../../shared/orchestration-worker-roles'
import { resolveOrchestrationHeartbeatInterval } from '../../../shared/orchestration-heartbeat'

export function applyOrchestrationSettingUpdates(
  updates: Partial<GlobalSettings>,
  sanitizedUpdates: Partial<GlobalSettings>
): void {
  if ('nestedWorkerMaxDepth' in updates) {
    sanitizedUpdates.nestedWorkerMaxDepth = resolveNestedWorkerMaxDepth({
      nestedWorkerMaxDepth: updates.nestedWorkerMaxDepth
    })
  }
  if ('orchestrationWorkerRoles' in updates) {
    sanitizedUpdates.orchestrationWorkerRoles = parseWorkerRoleProfiles(
      updates.orchestrationWorkerRoles
    )
  }
  if ('orchestrationHeartbeatIntervalMinutes' in updates) {
    sanitizedUpdates.orchestrationHeartbeatIntervalMinutes = resolveOrchestrationHeartbeatInterval({
      orchestrationHeartbeatIntervalMinutes: updates.orchestrationHeartbeatIntervalMinutes
    })
  }
}
