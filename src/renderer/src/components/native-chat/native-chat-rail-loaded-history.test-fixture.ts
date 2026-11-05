import type {
  AgentJournalRenderItem,
  AgentJournalSubmission
} from '../../../../shared/agent-session/journal/agent-session-journal-types'
import { nativeChatRowsInDrawOrder } from '../../../../shared/native-chat/transcript/native-chat-turn-grouping'
import { nativeChatTurnMembership } from '../../../../shared/native-chat/transcript/native-chat-turn-membership'
import { projectNativeChatTaskListFrames } from '../../../../shared/native-chat/input/native-chat-task-list-frames'
import { buildNativeChatRailItems } from './native-chat-message-rail-items'
import { createNativeChatMessageListProjection } from './native-chat-message-list-projection'
import { nativeChatSubagentSections } from './native-chat-subagent-sections'
import { omitNativeChatThreadGoalRows } from './native-chat-thread-goal-rows'
import { buildNativeChatTranscriptSlots } from './native-chat-transcript-slots'
import { projectStructuredAgentSessionMessages } from './structured-agent-session-message-projection'

export function loadedRailItems(
  items: AgentJournalRenderItem[],
  submissions: AgentJournalSubmission[]
) {
  const projection = createNativeChatMessageListProjection()(
    projectStructuredAgentSessionMessages(items, [], submissions)
  )
  const messages = omitNativeChatThreadGoalRows(
    projectNativeChatTaskListFrames(projection.conversation)
  )
  const membership = nativeChatTurnMembership(messages, { items, submissions })
  return buildNativeChatRailItems(
    buildNativeChatTranscriptSlots({
      messages: nativeChatRowsInDrawOrder(messages, membership.drawOrder),
      turnKeys: nativeChatRowsInDrawOrder(membership.turnKeys, membership.drawOrder),
      liveTurnKey: membership.liveTurnKey,
      receipts: new Map(),
      turnStatuses: { active: null, completedByTurn: {} },
      turnDiffs: new Map(),
      expandedTurnKeys: new Set(),
      isWorking: false,
      lifecycleWorking: false,
      subagentSections: nativeChatSubagentSections(messages, projection.subagentRows),
      subagentChoices: { sections: new Map(), rosters: new Map() }
    })
  )
}
