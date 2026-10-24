import { cn } from '@/lib/utils'
import { NATIVE_CHAT_APPEARANCE_ROOT_CLASS } from './native-chat-appearance-style'
import { useNativeChatStoreAppearanceStyle } from './use-native-chat-store-appearance-style'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store'
import { useNativeChatLaunchDraftSignal } from './use-native-chat-launch-draft-adoption'
import { useNativeChatRetainedSession } from './use-native-chat-retained-session'
import { isNativeChatTranscriptUnsettled } from './native-chat-live-session-contract'
import { selectNativeChatViewState } from './native-chat-view-state'
import { NativeChatMessageList } from './NativeChatMessageList'
import { NativeChatChildTranscriptStack } from './NativeChatChildTranscript'
import type { NativeChatMessageListHandle } from './use-native-chat-reveal-latest'
import {
  NativeChatChildNavigationContext,
  useNativeChatChildNavigator
} from './native-chat-child-navigation'
import {
  useNativeChatInteractiveSendReveal,
  useNativeChatRevealLatest
} from './use-native-chat-reveal-latest'
import { NativeChatComposer, type NativeChatComposerHandle } from './NativeChatComposer'
import { useNativeChatFontSize } from './use-native-chat-font-size'
import { useNativeChatFind } from './use-native-chat-find'
import { NativeChatFindBar } from './NativeChatFindBar'
import { useNativeChatCanSend } from './use-native-chat-can-send'
import { NativeChatInteractiveCard } from './NativeChatInteractiveCard'
import { nativeChatAskRequiresTerminal } from '../../../../shared/native-chat-agent-support'
import { useNativeChatInteractivePromptCard } from './use-native-chat-interactive-prompt-card'
import { useNativeChatPromptCardPresentation } from './use-native-chat-prompt-card-presentation'
import { NativeChatPromptStrip } from './NativeChatPromptCollapse'
import { NativeChatEmptyState } from './NativeChatEmptyState'
import { useNativeChatInteractiveSend } from './use-native-chat-interactive-send'
import { shouldClearNativeChatWorkingSuppression } from './native-chat-working-suppression'
import { resolveNativeChatTerminalTurn } from './native-chat-terminal-turn'
import { useNativeChatTerminalTurnTiming } from './use-native-chat-terminal-turn-timing'
import { shouldPruneLaunchPrompt } from './native-chat-pending'
import { useNativeChatPendingDelivery } from './use-native-chat-pending-delivery'
import {
  appendCommandMarkerCache,
  readCommandMarkerCache,
  type NativeChatCommandMarker
} from './native-chat-command-marker'
import { useNativeChatTerminalTranscript } from './use-native-chat-terminal-transcript'
import { useNativeChatRootInputRouting } from './use-native-chat-root-input-routing'
import {
  emptyNativeChatContextMenuActions,
  useNativeChatContextMenu
} from './use-native-chat-context-menu'
import { createNativeChatRuntimeSelector } from './native-chat-runtime-owner'
import { useNativeChatPasteBridge } from './use-native-chat-paste-bridge'
import { LinkActionPopover } from '@/components/link-actions/LinkActionPopover'
import { useNativeChatLinkActions } from './use-native-chat-link-actions'
import type { NativeChatResolvedViewProps } from './native-chat-view-types'
import { useNativeChatFileLinkContext } from './use-native-chat-file-link-context'
import { useRecheckNativeChatFileLinksWhenTurnEnds } from './use-native-chat-file-link-existence'
import { matchNativeChatSplitShortcut } from './native-chat-split-shortcut'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { formatShortcutLabel } from '@/hooks/useShortcutLabel'

/** Renders the bridge UI after NativeChatSessionGate resolves its agent session. */
export function NativeChatResolvedView({
  paneKey,
  agent,
  sessionId,
  transcriptPath,
  isVisible,
  isFocusedGroup,
  targetPtyId,
  terminalTabId,
  ownsTabWideLaunchDraft,
  onSwitchToTerminal,
  readTerminalScreen,
  contextMenuActions
}: NativeChatResolvedViewProps): React.JSX.Element {
  const childMessageListRef = useRef<NativeChatMessageListHandle>(null)
  // Primitive owner selection (no useShallow): routes the pane's read/subscribe to
  // the remote runtime host for a runtime-owned pane; null keeps the local path.
  const selectOwner = useMemo(() => createNativeChatRuntimeSelector(terminalTabId), [terminalTabId])
  const runtimeEnvironmentId = useAppStore(selectOwner)
  const childNavigator = useNativeChatChildNavigator(
    JSON.stringify([paneKey, runtimeEnvironmentId, sessionId])
  )
  const keybindings = useAppStore((s) => s.keybindings)
  const session = useNativeChatRetainedSession({
    paneKey,
    agent,
    sessionId,
    transcriptPath,
    runtimeEnvironmentId,
    enabled: isVisible
  })
  const launchPrompt = useAppStore((s) => s.nativeChatLaunchPromptByTabId[terminalTabId] ?? null)
  const clearNativeChatLaunchPrompt = useAppStore((s) => s.clearNativeChatLaunchPrompt)
  const paneLaunchPrompt = launchPrompt?.agent === agent ? launchPrompt : null
  // Launch context prefilled into the TUI input as an unsent draft; the
  // composer adopts it so the GUI view shows the same context as the TUI.
  const launchDraftSignal = useNativeChatLaunchDraftSignal({
    terminalTabId,
    agent,
    messages: session.messages,
    // 'awaiting' counts too: adopting a prefill against a transcript that hasn't
    // flushed would re-offer a prompt the user already submitted.
    transcriptLoading: isNativeChatTranscriptUnsettled(session.readPhase)
  })
  // The live-session merge reconciles hooks with replayable transcript turn
  // boundaries; all working consumers must use that one lifecycle decision.
  const liveWorking = session.status === 'working'
  // The agent's in-progress reply preview (hook), shown as a live streaming
  // bubble while it works — before the completed turn flushes to the transcript.
  const hookPreview = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.lastAssistantMessage)
  // Tool stdout/errors ride the same field for status-card previews; they are not the reply.
  const hookPreviewIsToolOutput = useAppStore(
    (s) => s.agentStatusByPaneKey[paneKey]?.lastAssistantMessageIsToolOutput === true
  )
  // Why: Stop suppression must clear on a newer working epoch even when status
  // never leaves 'working' (interrupt + immediate next turn coalesced).
  const workingEpoch = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.stateStartedAt ?? null)
  const canSend = useNativeChatCanSend(targetPtyId)
  // Reuse the verified composer send path for interactive cards and composer
  // stop (Stop sends ESC, the agent-TUI interrupt key).
  const send = useNativeChatInteractiveSend(paneKey, targetPtyId, agent)
  // Every send this pane makes brings the latest into view, wherever the reader had scrolled.
  const { messageListRef, revealLatest } = useNativeChatRevealLatest()
  const interactiveSend = useNativeChatInteractiveSendReveal(send, targetPtyId, revealLatest)
  const [workingInterrupted, setWorkingInterrupted] = useState(false)
  const previousWorkingEpochRef = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<NativeChatComposerHandle>(null)
  const readOnlyComposerRef = useRef<NativeChatComposerHandle>(null)
  const activeComposerRef = childNavigator.child ? readOnlyComposerRef : composerRef
  // The question card's free-text row; keeps Paste working while the card
  // replaces the composer.
  const questionAnswerInputRef = useRef<HTMLInputElement>(null)
  const readOnlyQuestionAnswerInputRef = useRef<HTMLInputElement>(null)
  const activeQuestionAnswerInputRef = childNavigator.child
    ? readOnlyQuestionAnswerInputRef
    : questionAnswerInputRef
  const fileLinkContext = useNativeChatFileLinkContext(terminalTabId)
  const onPaste = useNativeChatPasteBridge({
    rootRef,
    composerRef: activeComposerRef,
    questionAnswerInputRef: activeQuestionAnswerInputRef
  })

  // Optimistic "queued" sends (mobile parity): a composer send is echoed
  // immediately and pruned once its real user turn lands in the transcript, so
  // the message never vanishes between send and transcript catch-up.
  const commandMarkerScope = useMemo(
    () => ({ paneKey, agent, sessionId }),
    [paneKey, agent, sessionId]
  )
  const delivery = useNativeChatPendingDelivery({ paneKey, agent, session })
  const { record, clear } = delivery
  // Slash commands aren't chat turns, so they get a small local "Ran /clear"
  // system line instead of a user bubble. Capped + cached per conversation.
  const [commandMarkers, setCommandMarkers] = useState<NativeChatCommandMarker[]>(() =>
    readCommandMarkerCache(commandMarkerScope)
  )
  // Command markers are session-scoped because slash commands like /clear are
  // local feedback for a specific transcript boundary.
  useEffect(() => {
    setCommandMarkers(readCommandMarkerCache(commandMarkerScope))
    setWorkingInterrupted(false)
  }, [commandMarkerScope])
  useEffect(() => {
    if (!paneLaunchPrompt || !shouldPruneLaunchPrompt(paneLaunchPrompt, session.messages)) {
      return
    }
    clearNativeChatLaunchPrompt(terminalTabId)
  }, [clearNativeChatLaunchPrompt, paneLaunchPrompt, session.messages, terminalTabId])
  const onOptimisticSend = useCallback(
    (text: string, imagePaths?: string[]) => {
      setWorkingInterrupted(false)
      return record(text, imagePaths)
    },
    [record]
  )
  const onSlashCommand = useCallback(
    (command: string, output?: string) => {
      setCommandMarkers(appendCommandMarkerCache(commandMarkerScope, command, Date.now(), output))
    },
    [commandMarkerScope]
  )

  const { answerLocally, deliveryNotices, sessionAfterCommandBoundaries, sessionWithPending } =
    useNativeChatTerminalTranscript({
      session,
      launchPrompt: paneLaunchPrompt,
      agent,
      commandMarkers,
      delivery,
      previewText: hookPreview,
      working: liveWorking,
      previewIsToolOutput: hookPreviewIsToolOutput
    })
  const promptCard = useNativeChatInteractivePromptCard({
    paneKey,
    messages: sessionAfterCommandBoundaries.messages,
    transcriptSettled: session.readPhase === 'ready'
  })
  // Why one derived value: an answerable card takes the input region from the composer, which
  // would type into the agent's selector; both are never visible in one commit.
  const promptCardPresentation = useNativeChatPromptCardPresentation({
    paneKey,
    targetPtyId,
    card: promptCard,
    canSend,
    transcriptSettled: session.readPhase === 'ready'
  })
  const { card: shownPromptCard, collapsedCard } = promptCardPresentation
  const mountedPromptCard = shownPromptCard ?? collapsedCard
  const rootInput = useNativeChatRootInputRouting({
    tabId: terminalTabId,
    rootRef,
    composerRef: activeComposerRef,
    questionAnswerInputRef: activeQuestionAnswerInputRef,
    isVisible,
    isFocusedGroup,
    composerReady:
      shownPromptCard === null && targetPtyId !== null && canSend && childNavigator.child === null
  })

  // Derive the view state from the pending-augmented session so a send into an
  // otherwise-empty conversation flips to the list (showing the queued bubble)
  // instead of staying on the empty state.
  const viewState = selectNativeChatViewState(sessionWithPending)

  const isConversation = viewState.kind === 'ready'
  useEffect(() => {
    if (
      shouldClearNativeChatWorkingSuppression({
        working: liveWorking,
        interrupted: workingInterrupted,
        workingEpoch,
        previousWorkingEpoch: previousWorkingEpochRef.current
      })
    ) {
      setWorkingInterrupted(false)
    }
    if (liveWorking && workingEpoch != null) {
      previousWorkingEpochRef.current = workingEpoch
    }
    if (!liveWorking) {
      previousWorkingEpochRef.current = null
    }
  }, [liveWorking, workingInterrupted, workingEpoch])
  const { isWorking, turnActive, awaitingInput } = resolveNativeChatTerminalTurn({
    isConversation,
    working: liveWorking,
    hookAwaitingInput: session.hookAwaitingInput === true,
    interrupted: workingInterrupted,
    hasPromptCard: promptCard !== null
  })
  const turnTiming = useNativeChatTerminalTurnTiming(paneKey, session.messages, turnActive)
  useRecheckNativeChatFileLinksWhenTurnEnds(turnActive)

  const stopAgent = useCallback(() => {
    setWorkingInterrupted(true)
    // Why: Stop after a submitted turn drops the delayed-write handle once it
    // settles, so cancelPendingSends no longer sees the optimistic id. Clear
    // the echo cache here so a cancelled prompt cannot stick as a ghost bubble.
    clear()
    interactiveSend.cancel()
  }, [interactiveSend, clear])
  const { onLinkClick, linkActionRequest, closeLinkActions } = useNativeChatLinkActions(
    fileLinkContext,
    rootRef,
    { sessionId, isVisible }
  )

  // Only the focused conversation accepts chat text-size shortcuts.
  useNativeChatFontSize(isConversation && isVisible && isFocusedGroup, rootRef)
  const find = useNativeChatFind(
    isVisible && isFocusedGroup,
    rootRef,
    activeComposerRef,
    childNavigator.child ? childMessageListRef : messageListRef
  )
  const contextMenu = useNativeChatContextMenu({
    rootRef,
    composerRef: activeComposerRef,
    enabled: isVisible,
    onSwitchToTerminal,
    splitShortcutLabels: {
      right: formatShortcutLabel('terminal.splitRight', keybindings),
      down: formatShortcutLabel('terminal.splitDown', keybindings)
    },
    actions: { onPaste, ...(contextMenuActions ?? emptyNativeChatContextMenuActions) },
    messageListRef: childNavigator.child ? childMessageListRef : messageListRef,
    fileLinkContext,
    onFind: find.open
  })
  const appearanceStyle = useNativeChatStoreAppearanceStyle()

  return (
    <NativeChatChildNavigationContext.Provider value={childNavigator.navigation}>
      <div
        ref={rootRef}
        data-native-chat-root="true"
        data-native-chat-working={isWorking ? 'true' : 'false'}
        tabIndex={-1}
        onPointerDownCapture={(event) => {
          contextMenu.onPointerDownCapture(event)
          if (event.button === 2) {
            event.stopPropagation()
            return
          }
          rootInput.onPointerDownCapture(event)
        }}
        onKeyDownCapture={(event) => {
          find.onKeyDownCapture(event)
          const splitDirection = event.repeat
            ? null
            : matchNativeChatSplitShortcut(event, getShortcutPlatform(), keybindings)
          if (splitDirection && contextMenuActions) {
            event.preventDefault()
            event.stopPropagation()
            if (splitDirection === 'right') {
              contextMenuActions.onSplitRight()
            } else {
              contextMenuActions.onSplitDown()
            }
            return
          }
          rootInput.onKeyDownCapture(event)
        }}
        onContextMenuCapture={contextMenu.onContextMenuCapture}
        className={cn(
          NATIVE_CHAT_APPEARANCE_ROOT_CLASS,
          'flex h-full min-h-0 w-full flex-col focus:outline-none'
        )}
        style={appearanceStyle}
        data-native-chat-scheme={appearanceStyle.colorScheme}
      >
        {find.isOpen ? <NativeChatFindBar find={find} isVisible={isVisible} /> : null}
        <div
          hidden={childNavigator.child !== null}
          inert={childNavigator.child !== null}
          className={childNavigator.child ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}
        >
          <div className="relative flex min-h-0 flex-1 flex-col">
            {viewState.kind === 'loading' ? (
              <NativeChatEmptyState kind="loading" />
            ) : viewState.kind === 'error' ? (
              <NativeChatEmptyState kind="error" message={viewState.message} />
            ) : viewState.kind === 'empty' ? (
              <NativeChatEmptyState kind="empty" agent={agent} />
            ) : (
              <NativeChatMessageList
                ref={messageListRef}
                session={sessionWithPending}
                isVisible={isVisible && childNavigator.child === null}
                isWorking={turnActive}
                expandSignal={false}
                {...turnTiming}
                awaitingInput={awaitingInput}
                onLinkClick={onLinkClick}
                allowFileUriLinks={fileLinkContext !== null}
                deliveryNotices={deliveryNotices}
              />
            )}
          </div>
          {/* A collapsed card stays mounted but hidden, so a partly answered question survives. */}
          {mountedPromptCard ? (
            <div
              hidden={collapsedCard !== null}
              inert={collapsedCard !== null}
              className="contents"
            >
              <NativeChatInteractiveCard
                key={promptCardPresentation.occurrenceKey ?? 'prompt'}
                card={mountedPromptCard}
                send={interactiveSend}
                requiresTerminal={nativeChatAskRequiresTerminal(agent)}
                onAnswerInTerminal={onSwitchToTerminal}
                onDismiss={promptCardPresentation.dismiss}
                onCollapse={promptCardPresentation.collapse}
                shouldFocus={shownPromptCard !== null && isVisible && isFocusedGroup}
                answerInputRef={questionAnswerInputRef}
              />
            </div>
          ) : null}
          {collapsedCard ? (
            <NativeChatPromptStrip card={collapsedCard} onExpand={promptCardPresentation.expand} />
          ) : null}
          {/* canSend reflects the mobile presence-lock: when a mobile client holds
          the pty, the composer shows its guarded state instead of racing the
          mobile driver (R8). Under a card it stays mounted but hidden, so its state survives;
          detaching the ref keeps root typing, paste and reveal focus off it. */}
          <div hidden={shownPromptCard !== null} className="contents">
            <NativeChatComposer
              ref={shownPromptCard ? undefined : composerRef}
              inputOwnedByCard={shownPromptCard !== null}
              terminalTabId={terminalTabId}
              paneKey={paneKey}
              targetPtyId={targetPtyId}
              agent={agent}
              canSend={canSend}
              isWorking={isWorking}
              onStop={stopAgent}
              onOptimisticSend={onOptimisticSend}
              onOptimisticSendCanceled={delivery.cancel}
              optimisticSendOutcome={delivery}
              onSlashCommand={onSlashCommand}
              onSubmitted={revealLatest}
              answerCommandLocally={answerLocally}
              onSwitchToTerminal={onSwitchToTerminal}
              readTerminalScreen={readTerminalScreen}
              launchSeed={{ ...launchDraftSignal, ownsTabWideLaunchDraft }}
              recallSource={{ messages: sessionWithPending.messages, commands: commandMarkers }}
            />
          </div>
        </div>
        {childNavigator.child ? (
          <NativeChatChildTranscriptStack
            messageListRef={childMessageListRef}
            path={childNavigator.path}
            onBack={childNavigator.back}
            session={sessionWithPending}
            isVisible={isVisible}
            onLinkClick={onLinkClick}
          />
        ) : null}
        {contextMenu.menu}
        <LinkActionPopover request={linkActionRequest} onClose={closeLinkActions} />
      </div>
    </NativeChatChildNavigationContext.Provider>
  )
}
