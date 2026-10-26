import { useCallback } from 'react'
import type { AgentSessionOptionResult } from '../../../../shared/agent-session-wire'
import { AGENT_CHAT_PERMISSION_MODE_OPTION_ID } from '../../../../shared/agent-chat-permission-mode'
import { commitStructuredAgentSessionOptionValues } from '../../../../shared/structured-agent-session-options'
import type { StructuredAgentSessionMutate } from './use-structured-agent-session-mutate'
import type { useStructuredAgentSessionOptionState } from './use-structured-agent-session-option-state'
import type { useRememberSessionOptionPicks } from './use-structured-agent-session-option-picks'

const NO_HELD_OPTIONS: Readonly<Record<string, string>> = {}

export function useStructuredAgentSessionOptionWrite(args: {
  source: Pick<
    ReturnType<typeof useStructuredAgentSessionOptionState>,
    | 'optionStateRef'
    | 'activeOptionRecordRef'
    | 'pendingOptionsRef'
    | 'optionMutationGeneration'
    | 'beginOptionWrite'
    | 'isCurrentContext'
    | 'updateOptionState'
    | 'optionView'
  >
  providerStarting: boolean
  launchSeedOptions: Readonly<Record<string, string>> | undefined
  mutate: StructuredAgentSessionMutate
  rememberOptionPicks: ReturnType<typeof useRememberSessionOptionPicks>
}) {
  const { providerStarting, launchSeedOptions, mutate, rememberOptionPicks } = args
  const {
    optionStateRef,
    activeOptionRecordRef,
    pendingOptionsRef,
    optionMutationGeneration,
    beginOptionWrite,
    isCurrentContext,
    updateOptionState,
    optionView
  } = args.source
  return useCallback(
    async (id: string, encoded: string): Promise<boolean> => {
      const currentState = optionStateRef.current
      const targetRecord = currentState.record
      const finishWrite = beginOptionWrite(id)
      const mutationGeneration = ++optionMutationGeneration.current
      const sameRecord = (): boolean =>
        isCurrentContext() && activeOptionRecordRef.current === targetRecord
      const isCurrent = (): boolean =>
        sameRecord() && optionMutationGeneration.current === mutationGeneration
      const currentPick = (): boolean => isCurrent() || pendingOptionsRef.current[id] === encoded
      // Record-only: shown at once, so the picker stays usable while the write waits behind a start.
      const shownAtOnce = providerStarting || id === AGENT_CHAT_PERMISSION_MODE_OPTION_ID
      if (shownAtOnce) {
        updateOptionState((current) =>
          commitStructuredAgentSessionOptionValues(current, { [id]: encoded }, id)
        )
      } else {
        pendingOptionsRef.current[id] = encoded
        updateOptionState((current) => ({ ...current, pendingId: id }))
      }
      let result: AgentSessionOptionResult | null = null
      try {
        result = await mutate<AgentSessionOptionResult>(
          'agentSession.setOption',
          'agentSession.setOption',
          { key: id, value: encoded }
        )
        if (result && sameRecord() && currentPick()) {
          const returned = result.options ?? { [id]: encoded }
          const committed = isCurrent() ? returned : { [id]: returned[id] ?? encoded }
          updateOptionState((current) =>
            current.record === targetRecord
              ? commitStructuredAgentSessionOptionValues(current, committed, id)
              : current
          )
          // The launch seed names the model an effort-only pick was made under.
          rememberOptionPicks(
            optionView(currentState, launchSeedOptions, NO_HELD_OPTIONS),
            committed,
            id
          )
        }
        return Boolean(result)
      } finally {
        if (sameRecord() && pendingOptionsRef.current[id] === encoded) {
          delete pendingOptionsRef.current[id]
        }
        if (isCurrent()) {
          updateOptionState((current) =>
            current.record === targetRecord && current.pendingId === id
              ? { ...current, pendingId: null }
              : current
          )
        }
        finishWrite(isCurrent() && Boolean(result || shownAtOnce))
      }
    },
    [
      activeOptionRecordRef,
      beginOptionWrite,
      isCurrentContext,
      launchSeedOptions,
      mutate,
      optionMutationGeneration,
      optionStateRef,
      optionView,
      pendingOptionsRef,
      providerStarting,
      rememberOptionPicks,
      updateOptionState
    ]
  )
}
