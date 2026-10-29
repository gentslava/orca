import type { PersistedUIState } from '../../../shared/persisted-ui-state-types'
import type { WslMoveRewriteScope } from './wsl-move-rewrite-scope'

type OrderingState = Pick<PersistedUIState, 'personalProjectOrder'>

export function wslMovePersonalProjectOrderUpdate(
  ui: OrderingState,
  scope: WslMoveRewriteScope
): OrderingState | null {
  const order = ui.personalProjectOrder
  if (!order) {
    return null
  }
  const projects = { ...order.projects }
  let changed = false
  for (const [key, preference] of Object.entries(order.projects)) {
    const hostKey = movedPreferenceKey(key, scope)
    if (hostKey && !Object.hasOwn(projects, hostKey)) {
      projects[hostKey] = preference
      changed = true
    }
  }
  return changed
    ? {
        personalProjectOrder: {
          ...order,
          revision: Math.min(Number.MAX_SAFE_INTEGER, (order.revision ?? 0) + 1),
          projects
        }
      }
    : null
}

function movedPreferenceKey(key: string, scope: WslMoveRewriteScope): string | null {
  let identity: unknown
  try {
    identity = JSON.parse(key)
  } catch {
    return null
  }
  if (
    !Array.isArray(identity) ||
    identity.length !== 3 ||
    identity[0] !== 'local' ||
    identity[1] !== 'local' ||
    typeof identity[2] !== 'string' ||
    !identity[2].startsWith('repo:') ||
    !scope.inScope(identity[2].slice(5))
  ) {
    return null
  }
  return JSON.stringify([scope.destinationHostId, scope.destinationHostId, identity[2]])
}
