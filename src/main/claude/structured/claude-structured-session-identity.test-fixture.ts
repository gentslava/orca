import type { AgentSessionJournalIdentity } from '../../../shared/agent-session/journal/agent-session-journal-identity'
import { claudeProviderHandle } from '../../../shared/agent-session/lifecycle/provider-handles/agent-session-provider-handle-encoding'

export const PROVIDER_SESSION_ID = '819cf9f8-e43c-4ad7-b50f-54aa158a726a'

export function identityFor(sessionId = 'session-1'): AgentSessionJournalIdentity {
  return {
    sessionId,
    workspaceId: 'workspace-1',
    hostId: 'host-1',
    agent: 'claude',
    providerHandle: claudeProviderHandle(PROVIDER_SESSION_ID, null)
  }
}
