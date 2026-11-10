import type * as Chat from '../../../../../src/shared/native-chat/native-chat-types'
import type { NativeChatResolvedPrompt } from '../../../../../src/shared/native-chat/native-chat-resolution-receipt'
import type { NativeChatTurnStatus } from '../../../../../src/shared/native-chat/transcript/native-chat-turn-status'

export type MobileNativeChatMessageProps = {
  message: Chat.NativeChatMessage
  // Stable placement key survives older messages joining a folded row.
  rowKey?: string
  runOwner?: string
  // Only the newest live assistant row can still grow.
  mayStillGrow?: boolean
  // Compare plan updates against the prior write, not an empty checklist.
  previousTodoWrite?: Chat.NativeChatToolCallBlock
  previousUpdatePlan?: Chat.NativeChatToolCallBlock
  fontScale?: number
  turnStatus?: NativeChatTurnStatus | null
  turnStatusAbove?: boolean
  turnExpanded?: boolean
  turnKey?: string
  /** The chat may rewind to this row, by desktop's `nativeChatRowOffersRewind`. */
  rewindable?: true
  onToggleTurn?: (turnKey: string) => void
  activeTurnIsWorking?: boolean
  trailingRun?: boolean
  // The run’s first row draws all members; later members render no duplicate activity.
  workRun?: readonly Chat.NativeChatMessage[]
  joinsWorkRun?: boolean
  foldedAway?: boolean
  openReasoning?: ReadonlySet<string>
  structuredActivityUi?: boolean
  // Hide the reasoning row while the live activity line discloses the same block.
  reasoningIsLive?: boolean
  reasoningExpanded?: boolean
  onToggleReasoning?: (key: string) => void
  unsentNotice?: string
  receipt?: NativeChatResolvedPrompt
  awaiting?: boolean
  subagentGroupsOpen?: ReadonlySet<string>
  onToggleSubagentGroup?: (groupId: string) => void
  userMessageOpen?: boolean
  onToggleUserMessage?: (messageId: string) => void
}
