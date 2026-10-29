import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import type { NativeChatLiveSession } from './use-native-chat-live-session'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import type { NativeChatTurnActivity } from '../../../../shared/native-chat/transcript/native-chat-turn-activity'
import type { StructuredAgentSessionHostWork } from './use-structured-agent-session-transport-state'
import type { NativeChatDeliveryNotice } from './NativeChatMessageRow'
import type { AgentSessionLatestTurn } from '../../../../shared/agent-session-wire'
import type { NativeChatSettledTurns } from '../../../../shared/native-chat-turn-status'
import type { NativeChatAwaitingInput } from '../../../../shared/native-chat/native-chat-terminal-turn'
import type {
  AgentJournalRenderItem,
  AgentJournalSubmission
} from '../../../../shared/agent-session-journal-types'
import type { NativeChatRailOutlineEntry } from './native-chat-message-rail-items'
import type { useNativeChatSubagentSections } from './use-native-chat-subagent-sections'
import type { useNativeChatMessageListHandle } from './use-native-chat-reveal-latest'

export type NativeChatMessageListProps = {
  ref?: Parameters<typeof useNativeChatMessageListHandle>[0]
  session: NativeChatLiveSession
  /** With the items, what places each row in its turn (structured lane). */
  journalItems?: readonly AgentJournalRenderItem[]
  journalSubmissions?: readonly AgentJournalSubmission[]
  /** The host's newest turn record, which places a live turn whose record is not loaded. */
  journalLatestTurn?: AgentSessionLatestTurn | null
  /** The host's prompts still waiting on the person and its working answer (an older host: none). */
  journalHostWork?: StructuredAgentSessionHostWork
  /** Every subagent the session's rosters named, whether or not its roster row is loaded. */
  subagentRoster?: Parameters<typeof useNativeChatSubagentSections>[2]
  /** User messages older than the loaded window, from the host's outline. */
  railOutline?: readonly NativeChatRailOutlineEntry[] | null
  isVisible?: boolean
  isWorking: boolean
  /** Toolbar-driven desired open state for every tool run; each flip re-syncs. */
  expandSignal: boolean
  workingStartedAt?: number | null
  /** Host durations by prompt id; otherwise fall back to a duration observed locally. */
  settledTurns?: NativeChatSettledTurns
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks?: boolean
  deliveryNotices?: ReadonlyMap<string, NativeChatDeliveryNotice>
  /** Set while the turn waits on the reader; the live activity line yields to it. */
  awaitingInput?: NativeChatAwaitingInput | null
  turnActivity?: NativeChatTurnActivity | null
  /** A person's Stop is ending the live turn: its tail line reads "Stopping…". */
  stopping?: boolean
  runtimeContext?: RuntimeFileOperationArgs | null
}
