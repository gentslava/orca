import { withWorkspaceRoute } from '../../../../src/navigation/workspace-route'
import {
  useWorkspaceExecutionHost,
  workspaceRouteParams
} from '../../../../src/navigation/workspace-execution-host'
import { useLocalSearchParams } from 'expo-router'
import { MobileWebShellScreen } from '../../../../src/mobile-web-shell/MobileWebShellScreen'
import {
  shellScreenRoute,
  shellScreenRouteKey
} from '../../../../src/mobile-web-shell/shell-screen-route'
import { PageRouteUnavailableScreen } from '../../../../src/mobile-web-shell/PageRouteUnavailableScreen'
import { firstParam } from '../../../../src/navigation/route-param-reader'

// Encode both dynamic segments to keep decoded ids containing /, ?, # or whitespace within one segment.
// Ask shellScreenRoute schema too: encoding cannot make dot/dot-dot ids valid.
export default withWorkspaceRoute(function MobileAgentSessionHistoryScreen() {
  const params = useLocalSearchParams<{
    hostId?: string | string[]
    worktreeId?: string | string[]
    name?: string | string[]
    conversationId?: string | string[]
    origin?: string | string[]
  }>()
  const hostId = firstParam(params.hostId)
  const worktreeId = firstParam(params.worktreeId)
  const name = firstParam(params.name)
  const conversationId = firstParam(params.conversationId)
  const origin = firstParam(params.origin)
  const executionHost = useWorkspaceExecutionHost()
  const routeParams = {
    ...(name === '' ? {} : { name }),
    ...(origin === '' ? {} : { origin }),
    ...(conversationId === '' ? {} : { conversationId }),
    ...workspaceRouteParams(executionHost)
  }

  const route =
    hostId && worktreeId
      ? shellScreenRoute({
          pathname: `/h/${encodeURIComponent(hostId)}/agent-history/${encodeURIComponent(worktreeId)}`,
          // Omit absent name: name= is an explicit label, while absence lets the panel derive one.
          ...(Object.keys(routeParams).length === 0 ? {} : { params: routeParams })
        })
      : null
  if (route === null) {
    return <PageRouteUnavailableScreen hostId={hostId} />
  }
  // Keyed on the route: a host captures the grants its session was opened with, so a screen
  // reused across a route change would keep authorising frames under the grants of the route the
  // page has left. The key is what makes the change a remount, which disposes that bridge in the
  // commit, and the new session starts with no grants until its own `init`.
  return <MobileWebShellScreen key={shellScreenRouteKey(route)} hostId={hostId} route={route} />
})
