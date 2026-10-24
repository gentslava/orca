import { useEffect, useMemo, useRef } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { nativeChatToolFailures } from '../../../src/shared/native-chat-tool-failures'
import { nativeChatToolLineLabel } from '../../../src/shared/native-chat-tool-line-label'
import {
  describeLatestToolCall,
  NATIVE_CHAT_TOOL_ACTIVITY_COPY,
  selectActiveToolCall
} from '../../../src/shared/native-chat-tool-activity'
import { nativeChatToolRunIconName } from '../../../src/shared/native-chat-tool-icon'
import { nativeChatToolLineIdentity } from '../../../src/shared/native-chat-tool-line-identity'
import { pairNativeChatToolResults } from '../../../src/shared/native-chat-tool-pairing'
import { nativeChatToolRunOutcome } from '../../../src/shared/native-chat-tool-run-outcome'
import {
  NATIVE_CHAT_TOOL_RUN_SENTENCE_ENGLISH,
  nativeChatToolRunSentence
} from '../../../src/shared/native-chat-tool-run-sentence'
import { countToolCalls } from '../../../src/shared/native-chat-tool-summary'
import { buildEditCards } from '../../../src/shared/native-chat-edit-cards'
import {
  isToolCallBlock,
  type NativeChatBlock,
  type NativeChatToolCallBlock
} from '../../../src/shared/native-chat-types'
import { buildNativeChatTaskListRows } from '../../../src/shared/native-chat-task-list-history'
import { colors } from '../theme/mobile-theme'
import { MobileNativeChatToolGlyph } from './MobileNativeChatToolIcon'
import { MobileNativeChatToolLine } from './MobileNativeChatToolLine'
import { MobileNativeChatDiffCard } from './MobileNativeChatDiffCard'
import { MobileNativeChatTaskList } from './MobileNativeChatTaskList'
import { useMobileNativeChatDisclosure } from './mobile-native-chat-disclosure-store'
import { toolStyles as styles, toolType } from './mobile-native-chat-tool-styles'
import { mobileNativeChatMemberId } from './mobile-native-chat-reading-place'
import { MobileNativeChatToolRunMembers } from './MobileNativeChatToolRunMembers'
import type {
  MobileNativeChatToolRunAsides,
  MobileNativeChatToolRunProps
} from './mobile-native-chat-tool-run-props'
export type { MobileNativeChatToolRunAsides } from './mobile-native-chat-tool-run-props'

function fill(template: string, value: number): string {
  return template.replaceAll('{{value0}}', String(value))
}

/** Desktop's `animate-pulse` on a live run's sentence. One element either way, so the
 *  header never remounts as the run settles. */
function PulsingText({
  pulsing,
  style,
  children
}: {
  pulsing: boolean
  style?: React.ComponentProps<typeof Animated.Text>['style']
  children: React.ReactNode
}): React.JSX.Element {
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!pulsing) {
      opacity.setValue(1)
      return
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true })
      ])
    )
    animation.start()
    return () => animation.stop()
  }, [opacity, pulsing])
  return (
    <Animated.Text style={[style, { opacity }]} numberOfLines={1}>
      {children}
    </Animated.Text>
  )
}

/** Desktop parity: `NativeChatToolRun`. A run of tool calls under one sentence that
 *  opens to the individual tool lines. */
export function ToolRun({
  blocks,
  disclosureId,
  asides,
  activeTurnIsWorking,
  trailing,
  awaitingAnswer = false,
  previousTodoWrite,
  previousUpdatePlan,
  fontScale = 1,
  onOpenFile
}: MobileNativeChatToolRunProps): React.JSX.Element {
  const runKey = disclosureId === undefined ? undefined : `run:${disclosureId}`
  const [open, setOpen] = useMobileNativeChatDisclosure(runKey, false)
  // Rows drawn among the calls count as work too: a reader at the end follows them arriving.
  const asideCount = asides
    ? asides.after.length +
      Array.from(asides.before.values()).reduce((count, rows) => count + rows.length, 0)
    : 0
  // Live is the turn's state, not a call's: deriving it from "some call is running"
  // flipped the header to settled and back around every call.
  const live =
    activeTurnIsWorking === true && !awaitingAnswer
      ? trailing !== false
      : selectActiveToolCall(blocks, { activeTurnIsWorking }) !== null
  const callCount = countToolCalls(blocks)
  const sentence = nativeChatToolRunSentence(
    blocks,
    { live },
    NATIVE_CHAT_TOOL_RUN_SENTENCE_ENGLISH
  )
  const latestCall = live ? blocks.findLast(isToolCallBlock) : undefined
  const latestCallLabel = latestCall ? describeLatestToolCall(latestCall) : null
  const outcome = nativeChatToolRunOutcome(blocks, { activeTurnIsWorking })
  const headerIcon = nativeChatToolRunIconName(blocks.filter(isToolCallBlock))
  const fallbackLabel =
    callCount === 0 && asideCount > 0
      ? 'Activity'
      : callCount === 0
        ? 'Result'
        : callCount === 1
          ? NATIVE_CHAT_TOOL_ACTIVITY_COPY.countOne
          : fill(NATIVE_CHAT_TOOL_ACTIVITY_COPY.countN, callCount)
  const marks = [
    outcome.failedCallCount > 0
      ? fill(NATIVE_CHAT_TOOL_ACTIVITY_COPY.failedCount, outcome.failedCallCount)
      : null,
    outcome.interruptedCallCount > 0
      ? fill(NATIVE_CHAT_TOOL_ACTIVITY_COPY.interruptedCount, outcome.interruptedCallCount)
      : null
  ].filter((mark) => mark !== null)
  const type = toolType(fontScale)
  const iconSize = 15 * fontScale
  const failures = useMemo(() => nativeChatToolFailures(blocks), [blocks])
  const failureSeen = new Map<string, number>()

  return (
    <View style={styles.run} testID={mobileNativeChatMemberId('run')}>
      {/* One element for the run's whole life: live and settled are states of this
          button, not two buttons. */}
      <Pressable
        style={styles.header}
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLiveRegion="polite"
      >
        {headerIcon ? (
          <MobileNativeChatToolGlyph name={headerIcon} size={iconSize} color={colors.textMuted} />
        ) : null}
        <PulsingText
          pulsing={live}
          style={[styles.headerSentence, type.row, live && styles.headerSentenceLive]}
        >
          {sentence ?? fallbackLabel}
        </PulsingText>
        {marks.length > 0 ? (
          // Never shrinks: it is the one thing the reader cannot afford to miss.
          <Text style={[styles.lineMeta, styles.headerMarks, type.meta]} numberOfLines={1}>
            {` · ${marks.join(', ')}`}
          </Text>
        ) : null}
        {/* Only a stated success is marked done, and never while live. */}
        {!live && outcome.succeeded ? (
          <Check size={12 * fontScale} color={colors.textMuted} strokeWidth={2} />
        ) : null}
        {latestCallLabel ? (
          <Text style={[styles.headerLatest, type.meta]} numberOfLines={1}>
            {latestCallLabel}
          </Text>
        ) : null}
      </Pressable>
      {failures.map(({ call, result }) => {
        const label = call ? nativeChatToolLineLabel(call, result) : null
        const name = label?.target || call?.name || 'Result'
        const detail = result?.output || fill(NATIVE_CHAT_TOOL_ACTIVITY_COPY.failedCount, 1)
        const block = call ?? result
        return block ? (
          <Text
            key={nativeChatToolLineIdentity(block, failureSeen, true)}
            accessibilityRole="alert"
            style={[type.row, styles.errorText]}
          >
            {`${name}: ${detail}`}
          </Text>
        ) : null
      })}
      {open ? (
        <MobileNativeChatToolRunMembers
          followKey={blocks.length + asideCount}
          startsAtEnd={live}
          memoryKey={runKey}
          owner={disclosureId}
        >
          <ToolRunMemberList
            blocks={blocks}
            previousTodoWrite={previousTodoWrite}
            previousUpdatePlan={previousUpdatePlan}
            disclosureId={disclosureId}
            asides={asides}
            fontScale={fontScale}
            onOpenFile={onOpenFile}
          />
        </MobileNativeChatToolRunMembers>
      ) : null}
    </View>
  )
}

/** Desktop parity: `NativeChatToolRunMemberList`. Mounted only while the run is open,
 *  so a collapsed run pays for none of the pairing. */
function ToolRunMemberList({
  blocks,
  disclosureId,
  asides,
  previousTodoWrite,
  previousUpdatePlan,
  fontScale,
  onOpenFile
}: {
  blocks: NativeChatBlock[]
  disclosureId?: string
  asides?: MobileNativeChatToolRunAsides
  previousTodoWrite?: NativeChatToolCallBlock
  previousUpdatePlan?: NativeChatToolCallBlock
  fontScale: number
  onOpenFile?: (path: string) => void
}): React.JSX.Element {
  const taskLists = useMemo(
    () =>
      buildNativeChatTaskListRows(blocks, {
        todowrite: previousTodoWrite,
        update_plan: previousUpdatePlan
      }),
    [blocks, previousTodoWrite, previousUpdatePlan]
  )
  const { editCards, consumedResults } = useMemo(() => buildEditCards(blocks), [blocks])
  const { resultByCall, pairedResults } = useMemo(() => pairNativeChatToolResults(blocks), [blocks])
  const seen = new Map<string, number>()
  // Each drawn member's line identity: the page finds the reader's line by this, and a card keyed by
  // it keeps its state when older calls join the run above it.
  const memberSeen = new Map<string, number>()
  const memberIdentity = (block: NativeChatBlock) =>
    nativeChatToolLineIdentity(block, memberSeen, true)
  const member = (block: NativeChatBlock): React.ReactNode => {
    const taskList = taskLists.rows.get(block)
    if (taskList) {
      const id = memberIdentity(block)
      return (
        <View key={`tasks:${id}`} testID={mobileNativeChatMemberId(id)}>
          <MobileNativeChatTaskList
            {...taskList}
            fontScale={fontScale}
            disclosureKey={disclosureId === undefined ? undefined : `tasks:${disclosureId}:${id}`}
          />
        </View>
      )
    }
    const edit = editCards.get(block)
    if (edit) {
      const id = memberIdentity(block)
      return (
        <View key={`edit:${id}`} testID={mobileNativeChatMemberId(id)}>
          {edit.files.map((file, fileIndex) => (
            <MobileNativeChatDiffCard
              key={`${id}:${fileIndex}`}
              file={file}
              rootIdentity={`diff:${id}:${fileIndex}`}
              disclosureKey={
                disclosureId === undefined ? undefined : `diff:${disclosureId}:${id}:${fileIndex}`
              }
              fontScale={fontScale}
              onOpenFile={onOpenFile}
            />
          ))}
        </View>
      )
    }
    // A result its call now owns is drawn by that call's line, not as a row of its own.
    if (
      taskLists.consumedResults.has(block) ||
      consumedResults.has(block) ||
      pairedResults.has(block) ||
      (block.type !== 'tool-call' && block.type !== 'tool-result')
    ) {
      return null
    }
    const lineIdentity = nativeChatToolLineIdentity(block, seen, true)
    return (
      <MobileNativeChatToolLine
        key={lineIdentity}
        memberId={mobileNativeChatMemberId(memberIdentity(block))}
        block={block}
        result={block.type === 'tool-call' ? resultByCall.get(block) : undefined}
        disclosureKey={
          disclosureId === undefined ? undefined : `line:${disclosureId}:${lineIdentity}`
        }
        fontScale={fontScale}
        onOpenFile={onOpenFile}
      />
    )
  }

  return (
    <>
      {/* One flat keyed list with or without asides, so a row gaining its first never remounts a line. */}
      {blocks.flatMap((block) => [...(asides?.before.get(block) ?? []), member(block)])}
      {asides?.after}
    </>
  )
}
