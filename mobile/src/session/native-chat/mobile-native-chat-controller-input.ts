import type { MutableRefObject } from 'react'
import type { RpcClient } from '../../transport/rpc/rpc-client-contract'
import type { ConnectionState } from '../../transport/connection/connection-state'
import type { MobileNativeChatTab } from './mobile-native-chat-eligibility'
import type { StructuredAgentSessionHostSupport } from '../mobile-structured-agent-session-host-support'
import type { useMobileNativeChatSessionLane } from './use-mobile-native-chat-session-lane'

export type MobileNativeChatControllerInput = {
  client: RpcClient | null
  /** The route's paired host; differs from `client` only when a server executes the workspace. */
  pairedHostClient: RpcClient | null
  hostId: string
  worktreeId: string
  activeSessionTab: MobileNativeChatTab | null
  activeSessionTabId: string | null
  activeHandleRef: MutableRefObject<string | null>
  deviceTokenRef: MutableRefObject<string | null>
  nativeChatTranscriptIsLocalReadable: boolean
  nativeChatInputLeaseReady: boolean
  /** Live socket state; the lease collapses on disconnect but one render later. */
  connState: ConnectionState
  agentSessionHostSupport?: StructuredAgentSessionHostSupport | null
  onSendError: Parameters<typeof useMobileNativeChatSessionLane>[0]['onSendError']
  // Any accepted chat write clears the held failure banner, including answers and permission replies.
  onQueuedEditNotice?: (message: string) => void
  onSendResolved: () => void
}
