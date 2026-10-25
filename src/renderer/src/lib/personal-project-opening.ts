import type { AppState } from '@/store/types'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { getProjectHostSetupProjectionFromState } from '@/store/project-host-setup-selector'
import { resolveProjectPreferenceKey } from '../../../shared/project-preference-identity'
import { writePersonalProjectPreference } from '@/runtime/personal-project-order-client'

export function capturePersonalProjectOpening(
  state: AppState,
  repoId: string,
  hostId?: ExecutionHostId,
  navigationIntent?: 'user-open'
): (() => Promise<void>) | null {
  if (navigationIntent !== 'user-open') {
    return null
  }
  const { setups } = getProjectHostSetupProjectionFromState(state)
  const projectKey = resolveProjectPreferenceKey(repoId, setups, hostId)
  const previousProjectKey = state.activeRepoId
    ? resolveProjectPreferenceKey(state.activeRepoId, setups, state.activeWorkspaceExecutionHostId)
    : null
  if (!projectKey || projectKey === previousProjectKey) {
    return null
  }
  return () =>
    writePersonalProjectPreference('ui.recordProjectOpen', { projectKey, previousProjectKey })
}
