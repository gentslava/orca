import { agentSessionRecordFixture } from '../agent-session-record-test-fixture'
import type { AgentSessionRecord } from '../../../shared/agent-session-record'
import type { AgentModelCatalogSuccess } from './agent-model-catalog-store'

export function record(accountHomePath: string): AgentSessionRecord {
  return agentSessionRecordFixture({
    sessionId: 'session-1',
    provider: 'grok',
    accountHome: { variable: 'GROK_HOME', path: accountHomePath },
    location: {
      executionHostId: 'local',
      wslDistro: null,
      workspaceId: 'ws-1',
      workspaceKind: 'git-worktree'
    }
  })
}

export function listing(id: string): AgentModelCatalogSuccess {
  return {
    models: [{ id, label: id, isDefault: true, efforts: [] }],
    origin: 'probe'
  }
}

export const GROK_HOME = (path: string): { variable: 'GROK_HOME'; path: string } => ({
  variable: 'GROK_HOME',
  path
})
