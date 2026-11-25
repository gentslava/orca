import type { StructuredAgentSessionSendControl } from '../../../../../src/shared/agent-session/requests/structured-agent-session-send-mutation'
import type { StructuredAgentSessionComposerOptions } from '../../../../../src/shared/agent-session/view/structured-agent-session-composer'
import type { AgentSessionSlashCommand } from '../../../../../src/shared/agent-session/agent-session-wire'
import type { StructuredAgentSessionState } from '../../../../../src/shared/agent-session/view/live-read/structured-agent-session-reducer'
import type { RpcClient } from '../../../transport/rpc/rpc-client-contract'
import type { MobileNativeChatSendErrorReporter } from './delivery/use-mobile-native-chat-send-error'
import type { MobileStructuredSends } from './delivery/use-mobile-structured-sends'
import type { MobileStructuredSendsOut } from './delivery/use-mobile-structured-stop-offer'

export type MobileStructuredSendInput = {
  agent: string | null
  client: RpcClient | null
  sessionId: string | null
  enabled: boolean
  queueCapable: boolean
  steerCapable?: boolean
  queueFollowUps: boolean
  commandsWait: boolean
  stateRef: { readonly current: StructuredAgentSessionState }
  stopping: boolean
  /** The host's queue sends next: commands that cannot wait in line read the chat as working. */
  queueSendsNext: boolean
  accept: MobileStructuredSends['accept']
  acknowledge: MobileStructuredSends['acknowledge']
  reject: MobileStructuredSends['reject']
  holdUnconfirmed: MobileStructuredSends['holdUnconfirmed']
  commandPending: { current: boolean }
  onClearSent: () => () => void
  /** This chat's message sends still out, which a command waits behind as on desktop. */
  sendsOut: MobileStructuredSendsOut
  controller: Pick<
    StructuredAgentSessionComposerOptions,
    | 'snapshot'
    | 'setOption'
    | 'invokeAction'
    | 'conversationCommands'
    | 'compactInstructions'
    | 'changeThreadGoal'
    | 'openMcpPanel'
  >
  sessionCommands?: readonly AgentSessionSlashCommand[]
  onSendError: MobileNativeChatSendErrorReporter
  // Older hosts accept neither per-chat model nor effort.
  /** The chat's own model and effort each send carries; absent for an older host, which takes neither. */
  sendSelection?: () => Pick<StructuredAgentSessionSendControl, 'options' | 'selection'>
  sendOptions?: () => Readonly<Record<string, string>> | undefined
  isModelWritePending?: () => boolean
  // An older host refuses a send body carrying `skills`; there the `$name` text stands alone.
  takesSkills?: boolean
}
