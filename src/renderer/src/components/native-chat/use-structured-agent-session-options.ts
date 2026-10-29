import { structuredAgentSessionDefaultModelChoice } from '../../../../shared/structured-agent-session-default-model-choice'
import { useStructuredAgentSessionOptionWrite } from './use-structured-agent-session-option-write'
import type { StructuredAgentSessionOptionsArgs } from './structured-agent-session-options-contract'
import { toast } from 'sonner'
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { structuredAgentSessionSeedCatalog } from '../../../../shared/structured-agent-session-seed-catalog'
import type { SessionOptionsSurface } from '../../../../shared/native-chat/input/native-chat-session-options'
import { AGENT_CHAT_PERMISSION_MODE_OPTION_ID } from '../../../../shared/agent-chat-permission-mode'
import {
  canSetStructuredAgentSessionOption,
  lockedStructuredAgentSessionOptionSnapshot,
  structuredAgentSessionOptionSnapshot,
  type StructuredAgentSessionOptionState
} from '../../../../shared/structured-agent-session-options'
import { useRememberSessionOptionPicks } from './use-structured-agent-session-option-picks'
import {
  STRUCTURED_MODEL_DEFAULT_PICK,
  structuredOptionPickBlockingId
} from '../../../../shared/structured-agent-session-option-pick-book'
import { encodeStructuredAgentSessionOptionValue } from '../../../../shared/structured-agent-session-option-codec'
import { useHostModelCatalogUpgrade } from './use-host-model-catalog-upgrade'
import { useStructuredAgentSessionOptionState } from './use-structured-agent-session-option-state'
import { agentSessionWriteFailureText } from './agent-session-write-notice-text'
import {
  getStructuredAgentSessionLaunchSelection,
  holdStructuredAgentSessionLaunchOption,
  type StructuredLaunchOptionOutcome
} from '@/lib/structured-agent-session-launch-options'
import { AGENT_SESSION_DEFAULT_MODEL_CAPABILITY } from '../../../../shared/agent-session-default-model'
import { useStructuredAgentSessionHostCapability } from '@/runtime/structured-agent-session-host-capability'
import { useStructuredAgentSessionModelDefault } from './use-structured-agent-session-model-default'

export type { StructuredAgentSessionOptionsArgs } from './structured-agent-session-options-contract'

const NO_HELD_OPTIONS: Readonly<Record<string, string>> = {}

export function useStructuredAgentSessionOptions(args: StructuredAgentSessionOptionsArgs) {
  const {
    agent,
    fence,
    launch,
    mutate,
    providerVisible,
    sessionId,
    target,
    transportEnabled,
    turnId
  } = args
  const providerStarting = args.providerStarting ?? false
  const newLaunch = launch?.kind === 'new'
  const launchSeedOptions = launch?.seedOptions
  const held = launch?.heldOptions ?? NO_HELD_OPTIONS
  const optionCatalog = useMemo(() => structuredAgentSessionSeedCatalog(agent), [agent])
  const {
    optionView,
    takesSendOptions,
    optionState,
    optionStateRef,
    activeOptionRecordRef,
    optionPicks,
    updateOptionState,
    receiveCatalog,
    beginOptionWrite,
    writes,
    isCurrentContext,
    conversationSupport
  } = useStructuredAgentSessionOptionState({
    agent,
    optionCatalog,
    identity: `${agent}:${sessionId}`,
    fence,
    sessionId,
    target,
    newLaunch,
    ...(launch?.worktree ? { worktree: launch.worktree } : {}),
    seedsModel: launchSeedOptions?.model !== undefined,
    providerVisible,
    providerStarting,
    hostOptionStamp: args.hostOptionStamp ?? '',
    // Before start only resumed chats have recorded model evidence; new chats must wait instead of showing a guess.
    readsBeforeStart: launch?.kind !== 'new',
    turnId,
    unloadedTurnRevisions: args.unloadedTurnRevisions
  })

  const awaitingOptions =
    conversationSupport?.sessionId === sessionId && conversationSupport.fence !== fence
  const acceptsPicks =
    (!transportEnabled || fence !== null) && launch?.seedPending !== true && !awaitingOptions

  const hostCatalog = useHostModelCatalogUpgrade({
    agent,
    sessionId,
    target,
    optionCatalog,
    enabled: args.isVisible,
    // A resumed conversation may keep its own model, so only a new one runs the listed default.
    newLaunch,
    ...(launch?.worktree ? { worktree: launch.worktree } : {}),
    fence,
    turnId,
    reportedUnpickedModel:
      newLaunch && launchSeedOptions?.model === undefined && optionState.catalogSource === 'live',
    ...(args.providerRunning ? { providerRunning: true } : {}),
    activeOptionRecordRef,
    updateOptionState,
    receiveCatalog
  })

  const pendingView = useCallback(
    (state: StructuredAgentSessionOptionState) =>
      optionView(state, launchSeedOptions, held, launch?.explicitOptions),
    [held, launch?.explicitOptions, launchSeedOptions, optionView]
  )

  const rememberOptionPicks = useRememberSessionOptionPicks(target, agent)
  const takesModelDefault = useStructuredAgentSessionHostCapability(
    target,
    AGENT_SESSION_DEFAULT_MODEL_CAPABILITY
  )
  const sendStructuredOption = useStructuredAgentSessionOptionWrite({
    providerStarting,
    launchSeedOptions,
    mutate,
    rememberOptionPicks,
    source: {
      optionStateRef,
      activeOptionRecordRef,
      optionPicks,
      beginOptionWrite,
      isCurrentContext,
      updateOptionState,
      optionView
    }
  })
  const settleLaunchOptionPick = useCallback(
    (outcome: StructuredLaunchOptionOutcome) => {
      if (outcome.kind === 'refused') {
        toast.error(agentSessionWriteFailureText(outcome.failure, 'option'))
      } else if (outcome.kind === 'accepted') {
        rememberOptionPicks(
          optionView(optionStateRef.current, launchSeedOptions, NO_HELD_OPTIONS),
          outcome.options
        )
      }
    },
    [launchSeedOptions, optionStateRef, optionView, rememberOptionPicks]
  )
  const acceptsTurnPicks =
    acceptsPicks && (!(args.isWorking ?? turnId !== null) || takesSendOptions)
  const interactionReadyRef = useRef(acceptsTurnPicks)
  const lockSnapshotRef = useRef(
    (snapshot: ReturnType<typeof structuredAgentSessionOptionSnapshot>) => snapshot
  )
  const lockSnapshot = (snapshot: ReturnType<typeof structuredAgentSessionOptionSnapshot>) => {
    const choices =
      takesModelDefault && fence !== null
        ? snapshot.map((descriptor) =>
            descriptor.id === 'model'
              ? {
                  ...descriptor,
                  settable: true,
                  defaultChoice: structuredAgentSessionDefaultModelChoice(optionStateRef.current)
                }
              : descriptor
          )
        : snapshot
    return !acceptsPicks
      ? lockedStructuredAgentSessionOptionSnapshot(choices)
      : (args.isWorking ?? turnId !== null) && !takesSendOptions
        ? choices.map((descriptor) =>
            descriptor.id === AGENT_CHAT_PERMISSION_MODE_OPTION_ID
              ? descriptor
              : { ...descriptor, settable: false, disabledReason: 'host-update-required' as const }
          )
        : choices
  }
  useLayoutEffect(() => {
    interactionReadyRef.current = acceptsTurnPicks
    lockSnapshotRef.current = lockSnapshot
  })
  const optionSnapshot = lockSnapshot(
    structuredAgentSessionOptionSnapshot(pendingView(optionState))
  )
  const setStructuredOption = useCallback(
    async (id: string, value: string | boolean): Promise<boolean> => {
      const view = pendingView(optionStateRef.current)
      const encoded = encodeStructuredAgentSessionOptionValue(id, value)
      if (
        (id === AGENT_CHAT_PERMISSION_MODE_OPTION_ID &&
          value === 'own' &&
          !view.permissionOwnSupported) ||
        !isCurrentContext() ||
        optionPicks.current.pending.model === STRUCTURED_MODEL_DEFAULT_PICK ||
        !optionCatalog ||
        encoded === null ||
        !canSetStructuredAgentSessionOption(
          {
            ...view,
            pendingId: structuredOptionPickBlockingId(optionPicks.current, id, providerStarting)
          },
          id,
          value,
          lockSnapshotRef.current(structuredAgentSessionOptionSnapshot(view)),
          id === AGENT_CHAT_PERMISSION_MODE_OPTION_ID ? acceptsPicks : interactionReadyRef.current
        )
      ) {
        return false
      }
      if (!transportEnabled || fence === null) {
        // No fence yet: the launch holds it and applies it before anything else is sent.
        const applied = holdStructuredAgentSessionLaunchOption(sessionId, id, encoded)
        void applied?.then(settleLaunchOptionPick)
        return applied !== null
      }
      return sendStructuredOption(id, encoded)
    },
    [
      acceptsPicks,
      fence,
      optionCatalog,
      isCurrentContext,
      optionStateRef,
      optionPicks,
      pendingView,
      providerStarting,
      sendStructuredOption,
      sessionId,
      settleLaunchOptionPick,
      transportEnabled
    ]
  )
  const setOption = useCallback(
    async (id: string, value: string | boolean) => {
      await setStructuredOption(id, value)
      // Read held picks directly; an accepted launch pick may precede this render’s props.
      const currentHeld = getStructuredAgentSessionLaunchSelection(sessionId)?.held
      const view = optionView(
        optionStateRef.current,
        launchSeedOptions,
        currentHeld ?? NO_HELD_OPTIONS
      )
      return { snapshot: lockSnapshotRef.current(structuredAgentSessionOptionSnapshot(view)) }
    },
    [launchSeedOptions, optionStateRef, optionView, sessionId, setStructuredOption]
  )
  const resetOption = useStructuredAgentSessionModelDefault({
    agent,
    target,
    mutate,
    takesModelDefault,
    acceptsPicks,
    fence,
    launchSeedOptions,
    lockSnapshotRef,
    source: {
      optionView,
      optionStateRef,
      activeOptionRecordRef,
      optionPicks,
      writes,
      beginOptionWrite,
      isCurrentContext,
      updateOptionState
    }
  })
  const optionSurface = useMemo<SessionOptionsSurface>(
    () => ({
      ...(takesModelDefault ? { resetOption } : {}),
      getSnapshot: () => optionSnapshot,
      demandModelCatalog: hostCatalog.demandModelCatalog,
      setOption,
      invokeAction: async () => ({ snapshot: optionSnapshot }),
      subscribe: () => () => {}
    }),
    [setOption, optionSnapshot, hostCatalog.demandModelCatalog, resetOption, takesModelDefault]
  )

  const support =
    transportEnabled && conversationSupport?.sessionId === sessionId ? conversationSupport : null
  return {
    conversationCommands: support?.commands ?? [],
    /** Absent unless this host and session can change the goal. */
    threadGoal: support?.threadGoal,
    /** A goal only the agent's own `/goal` changes; absent from a host that predates it. */
    reportedThreadGoal: support?.reportedThreadGoal,
    /** Absent from a host that predates it or a session that writes no context facts. */
    contextUsage: support?.contextUsage,
    /** Absent from a host that predates it, and until the options read answers. */
    acceptsImages: support?.acceptsImages,
    /** Undefined until this fence's options read answers. */
    rewind: support?.fence === fence ? support.rewind : undefined,
    optionSnapshot,
    optionSurface,
    setStructuredOption,
    sendSource: { optionStateRef, optionPicks, optionView, takesSendOptions },
    unavailable: hostCatalog.unavailable
  }
}
