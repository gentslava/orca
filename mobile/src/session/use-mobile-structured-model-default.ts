import { useCallback, type RefObject } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import type { AgentSessionOptionResult } from '../../../src/shared/agent-session-wire'
import type { SessionOptionDescriptor } from '../../../src/shared/native-chat-session-options'
import {
  commitStructuredAgentSessionModelDefault,
  commitStructuredAgentSessionOptionValues
} from '../../../src/shared/structured-agent-session-options'
import { structuredAgentSessionShownSnapshot } from '../../../src/shared/structured-agent-session-option-view'
import type { StructuredAgentSessionMutate } from './mobile-structured-agent-session-rpc'
import type { useMobileStructuredOptionState } from './use-mobile-structured-option-state'
import { nativeChatSessionOptionsWrite } from './mobile-session-launch-operations'
import { isTuiAgent } from '../../../src/shared/tui-agent-config'

export function useMobileStructuredModelDefault(args: {
  agent: string | null
  client: RpcClient | null
  sessionId: string | null
  mutate: StructuredAgentSessionMutate
  takesModelDefault: boolean
  awaitingOptions: boolean
  lockSnapshotRef: RefObject<(snapshot: SessionOptionDescriptor[]) => SessionOptionDescriptor[]>
  source: Pick<
    ReturnType<typeof useMobileStructuredOptionState>,
    | 'optionStateRef'
    | 'activeOptionRecordRef'
    | 'pendingOptionRef'
    | 'optionMutationGeneration'
    | 'updateOptionState'
    | 'writes'
    | 'readRef'
    | 'isCurrentContext'
  >
}) {
  const { agent, client, sessionId, mutate, takesModelDefault, awaitingOptions, lockSnapshotRef } =
    args
  const {
    optionStateRef,
    activeOptionRecordRef,
    pendingOptionRef,
    optionMutationGeneration,
    updateOptionState,
    writes,
    readRef,
    isCurrentContext
  } = args.source
  return useCallback(
    async (id: string) => {
      const snapshot = () => ({
        snapshot: lockSnapshotRef.current(
          structuredAgentSessionShownSnapshot(optionStateRef.current)
        )
      })
      if (
        id !== 'model' ||
        takesModelDefault !== true ||
        !client ||
        !sessionId ||
        !agent ||
        awaitingOptions ||
        pendingOptionRef.current !== null ||
        !isCurrentContext()
      ) {
        return snapshot()
      }
      const targetRecord = optionStateRef.current.record
      const generation = ++optionMutationGeneration.current
      const current = () =>
        isCurrentContext() &&
        activeOptionRecordRef.current === targetRecord &&
        optionMutationGeneration.current === generation
      writes.current.count += 1
      pendingOptionRef.current = id
      updateOptionState((state) => ({ ...state, pendingId: id }))
      let readsBack = false
      try {
        const result = await mutate<AgentSessionOptionResult>(
          'agentSession.setOption',
          'agentSession.setOption',
          { key: id, value: null }
        )
        if (result.status === 'accepted' && result.sameFence && current()) {
          updateOptionState((state) =>
            result.value.modelDefault
              ? commitStructuredAgentSessionModelDefault(state, result.value.options ?? {})
              : {
                  ...commitStructuredAgentSessionOptionValues(state, result.value.options ?? {}),
                  modelDefault: false
                }
          )
          if (result.value.modelDefault && isTuiAgent(agent)) {
            void nativeChatSessionOptionsWrite
              .request(client, { type: 'clear-model', agent })
              .catch(() => {})
          }
        }
        readsBack = result.status !== 'rejected'
        return snapshot()
      } finally {
        if (current()) {
          pendingOptionRef.current = null
          updateOptionState((state) => ({ ...state, pendingId: null }))
        }
        if (isCurrentContext() && activeOptionRecordRef.current === targetRecord) {
          writes.current.count -= 1
          writes.current.readback ||= readsBack
          if (!writes.current.count && writes.current.readback) {
            readRef.current?.()
          }
        }
      }
    },
    [
      activeOptionRecordRef,
      agent,
      awaitingOptions,
      client,
      takesModelDefault,
      isCurrentContext,
      lockSnapshotRef,
      mutate,
      optionMutationGeneration,
      optionStateRef,
      pendingOptionRef,
      readRef,
      sessionId,
      updateOptionState,
      writes
    ]
  )
}
