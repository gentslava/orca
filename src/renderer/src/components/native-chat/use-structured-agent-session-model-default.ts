import { useCallback, type RefObject } from 'react'
import type { AgentType } from '../../../../shared/agent-status-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import type { AgentSessionOptionResult } from '../../../../shared/agent-session-wire'
import type { SessionOptionDescriptor } from '../../../../shared/native-chat-session-options'
import {
  commitStructuredAgentSessionModelDefault,
  commitStructuredAgentSessionOptionValues,
  structuredAgentSessionOptionSnapshot
} from '../../../../shared/structured-agent-session-options'
import type { StructuredAgentSessionMutate } from './use-structured-agent-session-mutate'
import type { useStructuredAgentSessionOptionState } from './use-structured-agent-session-option-state'
import { enqueueSessionOptionSettingsWrite } from './native-chat-session-option-settings-write'

export function useStructuredAgentSessionModelDefault(args: {
  agent: AgentType
  target: RuntimeClientTarget
  mutate: StructuredAgentSessionMutate
  takesModelDefault: boolean
  acceptsPicks: boolean
  fence: number | null
  launchSeedOptions: Readonly<Record<string, string>> | undefined
  lockSnapshotRef: RefObject<(snapshot: SessionOptionDescriptor[]) => SessionOptionDescriptor[]>
  source: Pick<
    ReturnType<typeof useStructuredAgentSessionOptionState>,
    | 'optionView'
    | 'optionStateRef'
    | 'activeOptionRecordRef'
    | 'pendingOptionsRef'
    | 'optionMutationGeneration'
    | 'beginOptionWrite'
    | 'isCurrentContext'
    | 'updateOptionState'
  >
}) {
  const {
    agent,
    target,
    mutate,
    takesModelDefault,
    acceptsPicks,
    fence,
    launchSeedOptions,
    lockSnapshotRef
  } = args
  const {
    optionView,
    optionStateRef,
    activeOptionRecordRef,
    pendingOptionsRef,
    optionMutationGeneration,
    beginOptionWrite,
    isCurrentContext,
    updateOptionState
  } = args.source
  return useCallback(
    async (id: string) => {
      const snapshot = () => ({
        snapshot: lockSnapshotRef.current(
          structuredAgentSessionOptionSnapshot(
            optionView(optionStateRef.current, launchSeedOptions, {})
          )
        )
      })
      if (
        id !== 'model' ||
        !takesModelDefault ||
        !acceptsPicks ||
        fence === null ||
        !isCurrentContext() ||
        optionStateRef.current.pendingId === 'model'
      ) {
        return snapshot()
      }
      const targetRecord = optionStateRef.current.record
      const finish = beginOptionWrite(id)
      const generation = ++optionMutationGeneration.current
      const sameRecord = () => isCurrentContext() && activeOptionRecordRef.current === targetRecord
      const current = () => sameRecord() && optionMutationGeneration.current === generation
      const pendingDefault = String(generation)
      pendingOptionsRef.current.modelDefault = pendingDefault
      updateOptionState((state) => ({ ...state, pendingId: id }))
      let accepted = false
      try {
        const result = await mutate<AgentSessionOptionResult>(
          'agentSession.setOption',
          'agentSession.setOption',
          { key: id, value: null }
        )
        accepted = Boolean(result)
        if (result && current()) {
          updateOptionState((state) =>
            result.modelDefault
              ? commitStructuredAgentSessionModelDefault(state, result.options ?? {})
              : {
                  ...commitStructuredAgentSessionOptionValues(state, result.options ?? {}),
                  modelDefault: false
                }
          )
          if (result.modelDefault) {
            void enqueueSessionOptionSettingsWrite(target, { type: 'clear-model', agent })
          }
        }
        return snapshot()
      } finally {
        if (sameRecord() && pendingOptionsRef.current.modelDefault === pendingDefault) {
          delete pendingOptionsRef.current.modelDefault
        }
        if (current()) {
          updateOptionState((state) => ({ ...state, pendingId: null }))
        }
        finish(accepted && current())
      }
    },
    [
      acceptsPicks,
      activeOptionRecordRef,
      agent,
      beginOptionWrite,
      fence,
      isCurrentContext,
      launchSeedOptions,
      lockSnapshotRef,
      mutate,
      optionMutationGeneration,
      optionStateRef,
      optionView,
      pendingOptionsRef,
      takesModelDefault,
      target,
      updateOptionState
    ]
  )
}
