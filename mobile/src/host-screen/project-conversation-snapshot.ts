import type { ExecutionHostId } from '../../../src/shared/execution-host'
import type { ProjectConversationHistorySnapshot } from './project-conversation-history-refresh'
import type { ConversationHistory, ConversationTab } from './project-conversations'

export type ConversationSnapshot = {
  tabs: Map<string, ConversationTab[]>
  history: ConversationHistory[]
  historyByHost: Map<ExecutionHostId, ProjectConversationHistorySnapshot>
  capabilities: Map<ExecutionHostId, readonly string[]>
  complete: boolean
  failed: boolean
}
export function mergeConversationSnapshot(
  next: ConversationSnapshot,
  previous: ConversationSnapshot | undefined,
  failedSources: ReadonlySet<ExecutionHostId>,
  failedTabs: ReadonlySet<string>
): ConversationSnapshot {
  const tabs = new Map(next.tabs)
  const capabilities = new Map(next.capabilities)
  const historyByHost = new Map(next.historyByHost)
  let history = next.history
  if (previous) {
    for (const source of failedSources) {
      const priorHistory = previous.historyByHost.get(source)
      if (priorHistory && !historyByHost.has(source)) {
        historyByHost.set(source, priorHistory)
      }
      const retained = previous.capabilities.get(source)
      if (!capabilities.has(source) && retained) {
        capabilities.set(source, retained)
      }
    }
    for (const key of failedTabs) {
      const retained = previous.tabs.get(key)
      if (retained) {
        tabs.set(key, retained)
      }
    }
    history = [
      ...history,
      ...previous.history.filter(
        (session) =>
          session.executionHostId &&
          !next.historyByHost.has(
            session.executionHostId.startsWith('runtime:') ? session.executionHostId : 'local'
          ) &&
          failedSources.has(
            session.executionHostId.startsWith('runtime:') ? session.executionHostId : 'local'
          )
      )
    ]
  }
  return { ...next, tabs, capabilities, history, historyByHost }
}
