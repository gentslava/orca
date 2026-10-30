import type { MobileStructuredAgentOptionsArgs } from './mobile-structured-agent-session-contract'
import {
  mobileStructuredModelDefaultSnapshot,
  useMobileStructuredModelDefault
} from './use-mobile-structured-model-default'
import { structuredOptionPickIsPending } from '../../../src/shared/structured-agent-session-option-pick-book'
import type { AgentSessionConversationCommand } from '../../../src/shared/agent-session/agent-session-conversation-command'
import { useMobileStructuredOptionState } from './use-mobile-structured-option-state'
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { isAgentSessionHandleProvider } from '../../../src/shared/agent-session-provider-handle'
import { structuredAgentSessionSeedCatalog } from '../../../src/shared/structured-agent-session-seed-catalog'
import type { AgentSessionOptionResult } from '../../../src/shared/agent-session-wire'
import type { SessionOptionValue } from '../../../src/shared/native-chat/input/native-chat-session-options'
import {
  canSetStructuredAgentSessionOption,
  lockedStructuredAgentSessionOptionSnapshot,
  structuredAgentSessionOptionPicks
} from '../../../src/shared/structured-agent-session-options'
import {
  structuredAgentSessionOptionView,
  structuredAgentSessionSendSelection,
  structuredAgentSessionMessageSelection,
  structuredAgentSessionShownSnapshot
} from '../../../src/shared/structured-agent-session-option-view'
import {
  AGENT_CHAT_PERMISSION_MODE_OPTION_ID,
  agentChatPermissionModes
} from '../../../src/shared/agent-chat-permission-mode'
import { legacyHostPermissionDescriptor } from '../../../src/shared/structured-agent-session-permission-option'
import { useMobileHostModelCatalogUpgrade } from './use-mobile-host-model-catalog-upgrade'
import { mobileCreatedStructuredSession } from './mobile-created-structured-sessions'
import { encodeStructuredAgentSessionOptionValue } from '../../../src/shared/structured-agent-session-option-codec'
import { useMobileStructuredOptionSurface } from './use-mobile-structured-option-surface'

const NO_COMMANDS: readonly AgentSessionConversationCommand[] = []

export function useMobileStructuredAgentOptions(args: MobileStructuredAgentOptionsArgs) {
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
  // An options answer made before the account's listing landed listed none of it.
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
    sendSelection: hostSupport?.sendSelection === true,
    newLaunch: createdHere !== undefined,
    worktree: createdHere?.worktree,
    coherentCatalog: hostSupport?.coherentModelCatalog === true
  })
  const {
    projectPermission,
    optionState,
    optionStateRef,
    activeOptionRecordRef,
    providerStarting,
    updateOptionState,
    conversationSupport,
    imageSupport,
    awaitingOptions,
    receiveCatalog,
    isCurrentContext,
    controller,
    optionPicks,
    writes,
    reread
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
  const interactionReadyRef = useRef(!awaitingOptions)
  const lockSnapshotRef = useRef(
    (snapshot: ReturnType<typeof structuredAgentSessionShownSnapshot>) => snapshot
  )
  const lockSnapshot = (snapshot: ReturnType<typeof structuredAgentSessionShownSnapshot>) =>
    awaitingOptions ? lockedStructuredAgentSessionOptionSnapshot(snapshot) : snapshot
  useLayoutEffect(() => {
    interactionReadyRef.current = !awaitingOptions
    lockSnapshotRef.current = lockSnapshot
  })
  const readOptionState = useCallback(
    () =>
      projectPermission({
        ...structuredAgentSessionOptionView(
          optionStateRef.current,
          undefined,
          controller.overlay()
        ),
        permissionOwnSupported: hostSupport ? hostSupport.permissionOwn === true : null
      }),
    [controller, projectPermission, hostSupport?.permissionOwn]
  )
  const shown = lockSnapshot(
    mobileStructuredModelDefaultSnapshot(
      structuredAgentSessionShownSnapshot(readOptionState()),
      readOptionState(),
      hostSupport?.defaultModel === true,
      awaitingOptions
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
      const view = structuredAgentSessionOptionView(currentState, undefined, controller.overlay())
      const pickState = {
        ...view,
        pendingId:
          providerStarting ||
          id === AGENT_CHAT_PERMISSION_MODE_OPTION_ID ||
          !controller.isPending(id)
            ? null
            : id
      }
      const encoded = encodeStructuredAgentSessionOptionValue(id, value)
      if (
        (id === AGENT_CHAT_PERMISSION_MODE_OPTION_ID &&
          value === 'own' &&
          !hostSupport?.permissionOwn) ||
        !isCurrentContext() ||
        awaitingOptions ||
        writes.current.count > 0 ||
        !client ||
        !sessionId ||
        !optionCatalog ||
        encoded === null ||
        !canSetStructuredAgentSessionOption(
          pickState,
          id,
          value,
          lockSnapshotRef.current(
            structuredAgentSessionShownSnapshot(
              structuredAgentSessionOptionView(currentState, undefined, controller.overlay())
            )
          ),
          interactionReadyRef.current
        )
      ) {
        return false
      }
      const targetRecord = currentState.record
      const model = structuredAgentSessionOptionPicks(view, { [id]: encoded })[0]?.modelId ?? null
      const operation = controller.issue(id, encoded, model)
      updateOptionState((current) => ({
        ...current,
        pendingId: providerStarting || id === AGENT_CHAT_PERMISSION_MODE_OPTION_ID ? null : id
      }))
      void controller.flush(async (pick) => {
        // A queued pick never retargets a replacement runtime.
        if (activeOptionRecordRef.current !== targetRecord) {
          return { kind: 'superseded' }
        }
        const result = await mutate<AgentSessionOptionResult>(
          'agentSession.setOption',
          'agentSession.setOption',
          {
            key: pick.key,
            value: pick.value
          }
        )
        return result.status === 'accepted'
          ? { kind: 'accepted', options: result.value.options ?? { [pick.key]: pick.value } }
          : result.status === 'unknown'
            ? { kind: 'unknown' }
            : { kind: 'refused' }
      })
      const outcome = await operation.result
      if (activeOptionRecordRef.current === targetRecord) {
        updateOptionState((current) => ({
          ...current,
          pendingId:
            current.pendingId !== null && controller.isPending(current.pendingId)
              ? current.pendingId
              : null
        }))
        if (outcome.kind === 'refused') {
          reread()
        }
      }
      return outcome.kind !== 'refused'
    },
    [
      hostSupport?.permissionOwn,
      projectPermission,
      providerStarting,
      client,
      awaitingOptions,
      writes,
      controller,
      mutate,
      optionCatalog,
      reread,
      sessionId,
      updateOptionState,
      isCurrentContext
    ]
  )

  // Controls and capture derive from the same queried base and transient operations.
  const sendSelection = useCallback(() => {
    const view = structuredAgentSessionOptionView(
      optionStateRef.current,
      undefined,
      controller.overlay()
    )
    return hostSupport?.sendSelection
      ? { selection: structuredAgentSessionMessageSelection(view) }
      : hostSupport?.sendOptions
        ? { options: structuredAgentSessionSendSelection(view) }
        : {}
  }, [controller, hostSupport?.sendSelection, hostSupport?.sendOptions])

  const isModelWritePending = useCallback(
    () =>
      structuredOptionPickIsPending(optionPicks.current, 'model') ||
      (!hostSupport?.sendSelection && controller.isPending('model')),
    [controller, hostSupport?.sendSelection, optionPicks]
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
      lockSnapshot: (snapshot) => lockSnapshotRef.current(snapshot),
      setStructuredOption,
      readOptionState,
      resetOption: hostSupport?.defaultModel === true ? resetOption : undefined
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
