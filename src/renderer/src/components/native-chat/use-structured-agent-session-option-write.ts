import {
  beginStructuredOptionPick,
  isLatestStructuredOptionPick,
  settleStructuredOptionPick,
  structuredOptionPickCommit
} from '../../../../shared/structured-agent-session-option-pick-book'
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
    | 'optionPicks'
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
    optionPicks,
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
      // Show record-only picks immediately while their writes wait behind provider startup.
      const shownAtOnce = providerStarting || id === AGENT_CHAT_PERMISSION_MODE_OPTION_ID
      const pick = beginStructuredOptionPick(optionPicks.current, id, encoded, shownAtOnce)
      const sameRecord = (): boolean =>
        isCurrentContext() && activeOptionRecordRef.current === targetRecord
      const isCurrent = (): boolean =>
        sameRecord() && isLatestStructuredOptionPick(optionPicks.current, pick)
      updateOptionState((current) =>
        shownAtOnce
          ? commitStructuredAgentSessionOptionValues(current, { [id]: encoded })
          : { ...current, pendingId: id }
      )
      let result: AgentSessionOptionResult | null = null
      try {
        result = await mutate<AgentSessionOptionResult>(
          'agentSession.setOption',
          'agentSession.setOption',
          { key: id, value: encoded }
        )
        const committed =
          result && sameRecord()
            ? structuredOptionPickCommit(optionPicks.current, pick, result.options)
            : null
        if (committed) {
          updateOptionState((current) =>
            current.record === targetRecord
              ? commitStructuredAgentSessionOptionValues(current, committed)
              : current
          )
          // The launch seed names the model an effort-only pick was made under.
          rememberOptionPicks(
            optionView(currentState, launchSeedOptions, NO_HELD_OPTIONS),
            committed
          )
        }
        return Boolean(result)
      } finally {
        if (sameRecord()) {
          settleStructuredOptionPick(optionPicks.current, pick)
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
      optionStateRef,
      optionView,
      optionPicks,
      providerStarting,
      rememberOptionPicks,
      updateOptionState
    ]
  )
}
