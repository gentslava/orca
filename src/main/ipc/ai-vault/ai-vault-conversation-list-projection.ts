import { requestedExecutionHostScope } from '../../../shared/execution-host/execution-host'
import type {
  AiVaultListArgs,
  AiVaultListResult
} from '../../../shared/ai-vault/contracts/ai-vault-types'
import { boundedAiVaultConversationList } from '../../ai-vault/structured-conversation-navigation'
import {
  OPENS_EVERY_STRUCTURED_CHAT,
  projectStructuredAiVaultSessions
} from '../../ai-vault/structured-sessions/structured-session-ownership'

export function projectLocalAiVaultConversationList(
  result: AiVaultListResult,
  args: AiVaultListArgs | undefined,
  getChildSessionIds?: () => ReadonlySet<string> | null
): AiVaultListResult {
  const scope = requestedExecutionHostScope(args?.executionHostScope)
  const includeLocalRecords =
    args?.includeStructuredSessions && (scope === 'local' || scope === 'all')
  const projected = projectStructuredAiVaultSessions(result, OPENS_EVERY_STRUCTURED_CHAT, {
    includeStructuredSessions: includeLocalRecords,
    childSessionIds: includeLocalRecords ? getChildSessionIds?.() : undefined
  })
  return includeLocalRecords && !projected.unchanged
    ? boundedAiVaultConversationList(projected, args)
    : projected
}
