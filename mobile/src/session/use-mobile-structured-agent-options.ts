import { useMobileStructuredOptionState } from './use-mobile-structured-option-state'
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { isAgentSessionHandleProvider } from '../../../src/shared/agent-session-provider-handle'
import { structuredAgentSessionSeedCatalog } from '../../../src/shared/structured-agent-session-seed-catalog'
import type { AgentSessionOptionResult } from '../../../src/shared/agent-session-wire'
import type { SessionOptionValue } from '../../../src/shared/native-chat/input/native-chat-session-options'
import {
  canSetStructuredAgentSessionOption,
  commitStructuredAgentSessionOption,
  commitStructuredAgentSessionOptionValues,
  structuredAgentSessionOptionPicks
} from '../../../src/shared/structured-agent-session-options'
import {
  structuredAgentSessionOptionView,
  structuredAgentSessionSendSelection,
  structuredAgentSessionShownSnapshot
} from '../../../src/shared/structured-agent-session-option-view'
import {
  AGENT_CHAT_PERMISSION_MODE_OPTION_ID,
  agentChatPermissionModes
} from '../../../src/shared/agent-chat-permission-mode'
import { legacyHostPermissionDescriptor } from '../../../src/shared/structured-agent-session-permission-option'
import type { RpcClient } from '../transport/rpc-client'
import type { StructuredAgentSessionHostSupport } from './mobile-structured-agent-session-host-support'
import type { StructuredAgentSessionMutate } from './mobile-structured-agent-session-rpc'
import { persistMobileStructuredOptionPicks } from './native-chat/input/mobile-native-chat-session-option-persistence'
import { useMobileHostModelCatalogUpgrade } from './use-mobile-host-model-catalog-upgrade'
import { mobileCreatedStructuredSession } from './mobile-created-structured-sessions'
import { encodeStructuredAgentSessionOptionValue } from '../../../src/shared/structured-agent-session-option-codec'
import {
  beginStructuredOptionPick,
  isLatestStructuredOptionPick,
  settleStructuredOptionPick,
  structuredOptionPickCommit,
  structuredOptionPickBlockingId,
  structuredOptionPickIsPending
} from '../../../src/shared/structured-agent-session-option-pick-book'
import { useMobileStructuredOptionSurface } from './use-mobile-structured-option-surface'
import {
  MOBILE_MODEL_DEFAULT_PICK,
  mobileStructuredModelDefaultSnapshot,
  useMobileStructuredModelDefault
} from './use-mobile-structured-model-default'

const NO_COMMANDS = [] as const

export function useMobileStructuredAgentOptions(args: {
  agent: string | null
  client: RpcClient | null
  sessionId: string | null
  enabled: boolean
  fence: number | null
  mutate: StructuredAgentSessionMutate
  optionStamp?: string
  turnId: string | null
  hostSupport: Pick<
    StructuredAgentSessionHostSupport,
    'permissionModes' | 'permissionOwn' | 'coherentModelCatalog' | 'statusFeed' | 'defaultModel'
  > | null
}) {
  const { agent, client, enabled, fence, mutate, optionStamp, sessionId, turnId, hostSupport } =
    args
  const optionCatalog = useMemo(
    () => (agent ? structuredAgentSessionSeedCatalog(agent) : null),
    [agent]
  )
  const createdHere = useMemo(
    () => (sessionId ? mobileCreatedStructuredSession(sessionId) : undefined),
    [sessionId]
  )
  const optionSource = useMobileStructuredOptionState({
    agent,
    enabled,
    statusFeed: hostSupport?.statusFeed === true,
    fence,
    optionCatalog,
    sessionId,
    turnId,
    client,
    optionStamp,
    newLaunch: createdHere !== undefined,
    worktree: createdHere?.worktree,
    coherentCatalog: hostSupport?.coherentModelCatalog === true
  })
  const {
    projectPermission,
    optionState,
    optionStateRef,
    activeOptionRecordRef,
    optionPicks,
    providerStarting,
    updateOptionState,
    conversationSupport,
    imageSupport,
    awaitingOptions,
    writes,
    readRef,
    receiveCatalog,
    isCurrentContext
  } = optionSource
  const demandModelCatalog = useMobileHostModelCatalogUpgrade({
    agent,
    client,
    sessionId,
    enabled,
    fence,
    newLaunch: createdHere !== undefined,
    ...(createdHere ? { worktree: createdHere.worktree } : {}),
    optionCatalog,
    activeOptionRecordRef,
    updateOptionState,
    receiveCatalog
  })

  // Pre-1.4.225 hosts lack per-chat modes; show their actual global agent mode.
  const legacyHostPermissions =
    agent !== null &&
    agentChatPermissionModes(agent) !== null &&
    hostSupport?.permissionModes === false &&
    imageSupport?.sessionId === sessionId &&
    !imageSupport.statesPermissionMode &&
    optionState.permissionMode === null
  const lockSnapshotRef = useRef(
    (snapshot: ReturnType<typeof structuredAgentSessionShownSnapshot>) => snapshot
  )
  const lockSnapshot = (snapshot: ReturnType<typeof structuredAgentSessionShownSnapshot>) =>
    mobileStructuredModelDefaultSnapshot(
      snapshot,
      optionStateRef.current,
      hostSupport?.defaultModel === true,
      awaitingOptions
    )
  useLayoutEffect(() => {
    lockSnapshotRef.current = lockSnapshot
  })
  const shown = lockSnapshot(
    structuredAgentSessionShownSnapshot(
      projectPermission({
        ...optionState,
        permissionOwnSupported: hostSupport ? hostSupport.permissionOwn === true : null
      })
    )
  )
  const optionSnapshot = legacyHostPermissions
    ? [...shown, legacyHostPermissionDescriptor()]
    : shown

  const setStructuredOption = useCallback(
    async (id: string, value: SessionOptionValue): Promise<boolean> => {
      const currentState = projectPermission({
        ...optionStateRef.current,
        permissionOwnSupported: hostSupport ? hostSupport.permissionOwn === true : null
      })
      const encoded = encodeStructuredAgentSessionOptionValue(id, value)
      if (
        (id === AGENT_CHAT_PERMISSION_MODE_OPTION_ID &&
          value === 'own' &&
          !hostSupport?.permissionOwn) ||
        !isCurrentContext() ||
        optionPicks.current.pending.model === MOBILE_MODEL_DEFAULT_PICK ||
        !client ||
        !sessionId ||
        !optionCatalog ||
        encoded === null ||
        !canSetStructuredAgentSessionOption(
          {
            ...structuredAgentSessionOptionView(currentState, undefined, {}),
            pendingId: structuredOptionPickBlockingId(optionPicks.current, id, providerStarting)
          },
          id,
          value,
          lockSnapshotRef.current(structuredAgentSessionShownSnapshot(currentState))
        )
      ) {
        return false
      }
      const targetRecord = currentState.record
      writes.current.count += 1
      const shownAtOnce = providerStarting || id === AGENT_CHAT_PERMISSION_MODE_OPTION_ID
      const pick = beginStructuredOptionPick(optionPicks.current, id, encoded, shownAtOnce)
      const sameRecord = (): boolean =>
        isCurrentContext() && activeOptionRecordRef.current === targetRecord
      const isCurrent = (): boolean =>
        sameRecord() && isLatestStructuredOptionPick(optionPicks.current, pick)
      if (shownAtOnce) {
        updateOptionState((current) =>
          current.record === targetRecord
            ? commitStructuredAgentSessionOption(current, id, encoded)
            : current
        )
      } else {
        updateOptionState((current) => ({ ...current, pendingId: id }))
      }
      let readsBack = shownAtOnce
      try {
        const result = await mutate<AgentSessionOptionResult>(
          'agentSession.setOption',
          'agentSession.setOption',
          { key: id, value: encoded }
        )
        // As on desktop, a reply that never came is not a pick done.
        if (result.status !== 'accepted') {
          return false
        }
        const committed =
          sameRecord() && result.sameFence
            ? structuredOptionPickCommit(optionPicks.current, pick, result.value.options)
            : null
        if (committed) {
          updateOptionState((current) =>
            current.record === targetRecord && result.sameFence
              ? commitStructuredAgentSessionOptionValues(current, committed, id)
              : current
          )
          // Persist only accepted picks; uncertain optimism must not seed future launches with an option the provider may have refused.
          if (agent) {
            void persistMobileStructuredOptionPicks({
              client,
              agent,
              picks: structuredAgentSessionOptionPicks(currentState, committed, id)
            })
          }
        }
        readsBack = result.sameFence
        return true
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
        if (sameRecord()) {
          writes.current.count -= 1
          writes.current.readback ||= readsBack && isCurrent()
          if (!writes.current.count && writes.current.readback) {
            readRef.current?.()
          }
        }
      }
    },
    [
      agent,
      hostSupport?.permissionOwn,
      projectPermission,
      client,
      mutate,
      optionCatalog,
      optionPicks,
      providerStarting,
      writes,
      isCurrentContext,
      sessionId,
      updateOptionState
    ]
  )

  const sendSelection = useCallback(
    () =>
      structuredOptionPickIsPending(optionPicks.current, 'model')
        ? undefined
        : structuredAgentSessionSendSelection(optionStateRef.current),
    []
  )
  const isModelWritePending = useCallback(
    () => structuredOptionPickIsPending(optionPicks.current, 'model'),
    []
  )
  const resetOption = useMobileStructuredModelDefault({
    agent,
    client,
    sessionId,
    mutate,
    takesModelDefault: hostSupport?.defaultModel === true,
    awaitingOptions,
    lockSnapshotRef,
    source: optionSource
  })
  const { optionPickerRequest, invokeStructuredOption, optionSurface } =
    useMobileStructuredOptionSurface({
      optionSnapshot,
      demandModelCatalog,
      setStructuredOption,
      optionStateRef,
      projectPermission,
      resetOption: hostSupport?.defaultModel === true ? resetOption : undefined,
      lockSnapshot: (snapshot) => lockSnapshotRef.current(snapshot)
    })

  return {
    optionPickerRequest,
    conversationCommands:
      conversationSupport?.sessionId === sessionId ? conversationSupport.commands : NO_COMMANDS,
    acceptsImages:
      (imageSupport?.sessionId === sessionId ? imageSupport.acceptsImages : undefined) ??
      (agent !== null && isAgentSessionHandleProvider(agent)),
    optionSnapshot,
    optionSurface,
    pendingOptionId: optionState.pendingId,
    setStructuredOption,
    invokeStructuredOption,
    sendSelection,
    isModelWritePending
  }
}
