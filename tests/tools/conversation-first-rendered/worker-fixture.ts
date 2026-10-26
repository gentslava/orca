import type { AgentJournalRenderItem } from '../../../src/shared/agent-session-journal-types'
import type { AgentSessionHistoryPage } from '../../../src/shared/agent-session-wire'
import { ORCHESTRATION_SESSION_CHILDREN_CAPABILITY } from '../../../src/shared/orchestration-session-children'

const startedAt = Date.now() - 10000
const items: AgentJournalRenderItem[] = [
  {
    itemId: 'instruction',
    revision: 1,
    sequence: 1,
    observedAt: startedAt,
    body: {
      kind: 'message',
      role: 'user',
      blocks: [{ type: 'text', text: 'Review the queue behavior.' }]
    }
  },
  {
    itemId: 'progress',
    revision: 1,
    sequence: 2,
    observedAt: startedAt + 1000,
    body: {
      kind: 'message',
      role: 'assistant',
      blocks: [{ type: 'text', text: 'I am checking the actual keyboard handlers.' }]
    }
  },
  {
    itemId: 'command',
    revision: 1,
    sequence: 3,
    observedAt: startedAt + 2000,
    body: {
      kind: 'tool-call',
      name: 'read_file',
      input: { path: 'composer.tsx' },
      state: 'completed',
      output: {
        head: 'Original tool result from the worker journal.',
        byteLength: 45,
        digest: 'fixture',
        truncated: false
      }
    }
  },
  {
    itemId: 'answer',
    revision: 1,
    sequence: 4,
    observedAt: startedAt + 3000,
    body: {
      kind: 'message',
      role: 'assistant',
      blocks: [{ type: 'text', text: 'The separate worker verified both Enter behaviors.' }]
    }
  },
  {
    itemId: 'nested',
    revision: 1,
    sequence: 5,
    observedAt: startedAt + 4000,
    body: {
      kind: 'message',
      role: 'assistant',
      blocks: [
        {
          type: 'subagent-group',
          groupId: 'worker-nested',
          agents: [{ id: 'worker-native-child', label: 'Nested worker agent', state: 'completed' }]
        }
      ]
    }
  },
  {
    itemId: 'nested-answer',
    revision: 1,
    sequence: 6,
    observedAt: startedAt + 5000,
    agentId: 'worker-native-child',
    body: {
      kind: 'message',
      role: 'assistant',
      blocks: [{ type: 'text', text: 'The nested worker transcript is independently inspectable.' }]
    }
  }
]
const cursor = { epoch: 'worker-fixture', sequence: 6 }
const page: AgentSessionHistoryPage = {
  sessionId: 'worker-fixture',
  epoch: 'worker-fixture',
  direction: 'tail',
  items,
  removedItemIds: [],
  submissions: [],
  window: { oldest: { epoch: 'worker-fixture', sequence: 1 }, newest: cursor, nextCursor: cursor },
  liveCursor: cursor,
  hasOlder: false,
  hasNewer: false
}

export function installWorkerFixtureRuntime(): void {
  const calls: string[] = []
  Object.defineProperty(window, 'fixtureWorkerCalls', { value: calls })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ...window.api,
      runtime: {
        getStatus: async () => ({ capabilities: [ORCHESTRATION_SESSION_CHILDREN_CAPABILITY] }),
        call: async ({ method, params }: { method: string; params?: { sessionId?: string } }) => {
          calls.push(method)
          const result =
            method === 'orchestration.sessionChildren'
              ? {
                  children:
                    params?.sessionId === 'fixture'
                      ? [
                          {
                            dispatchId: 'worker-attempt',
                            taskId: 'worker-task',
                            runId: 'worker-run',
                            label: 'Cross-provider worker',
                            state: 'completed',
                            workerState: 'succeeded',
                            startedAt,
                            settledAt: startedAt + 5000,
                            result: 'Recorded completion remains available after release.',
                            conversation: {
                              kind: 'journal',
                              sessionId: 'worker-fixture',
                              agent: 'claude',
                              workspaceId: 'folder-fixture'
                            }
                          }
                        ]
                      : [],
                  nextCursor: null
                }
              : method === 'agentSession.history' && params?.sessionId === 'worker-fixture'
                ? { ok: true, page }
                : null
          if (result === null) {
            throw new Error(`Unexpected worker fixture RPC: ${method}`)
          }
          return { id: 'fixture', ok: true, result }
        },
        subscribe: async ({ method }: { method: string }, emit: (response: unknown) => void) => {
          calls.push(method)
          if (method !== 'agentSession.subscribe') {
            throw new Error(`Unexpected worker fixture stream: ${method}`)
          }
          queueMicrotask(() =>
            emit({
              id: 'fixture',
              ok: true,
              result: { type: 'snapshot', sessionId: 'worker-fixture', page, fence: 1 }
            })
          )
          return {
            unsubscribe: () => {
              calls.push('unsubscribe')
            }
          }
        }
      }
    }
  })
}
