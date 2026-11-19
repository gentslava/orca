// @vitest-environment happy-dom
import { activateMobileUiLocale } from '../../../../i18n/mobile-i18n'
import type { MobileQueuedMessageCard } from './mobile-structured-queued-message-cards'

import { createElement } from 'react'

import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  useMobileNativeChatComposerTray,
  type MobileNativeChatComposerTray
} from '../../composer/menus/use-mobile-native-chat-composer-tray'

const fontScale = 1
vi.mock('../../../../components/reorder/DragReorderList', () => ({
  DragReorderList: 'DragReorderList'
}))
vi.mock('react-native-reanimated', async () => {
  const { useRef } = await import('react')
  return {
    default: { ScrollView: 'ScrollView' },
    useAnimatedRef: () => useRef(null),
    useSharedValue: (value: unknown) => useRef({ value }).current
  }
})

vi.mock('react-native', () => ({
  useWindowDimensions: () => ({ fontScale }),
  ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View'
}))

vi.mock('lucide-react-native', () => ({
  Image: 'Image',
  AlertCircle: 'AlertCircle',
  ArrowUpRight: 'ArrowUpRight',
  Check: 'Check',
  ChevronDown: 'ChevronDown',
  ChevronUp: 'ChevronUp',
  ChevronRight: 'ChevronRight',
  CornerDownRight: 'CornerDownRight',
  ListEnd: 'ListEnd',
  MoreHorizontal: 'MoreHorizontal',
  Pencil: 'Pencil',
  Play: 'Play',
  Send: 'Send',
  Trash2: 'Trash2',
  X: 'X'
}))

vi.mock('../../../../components/sheets/ActionSheetModal', () => ({
  ActionSheetModal: 'ActionSheetModal'
}))
vi.mock('../tasks/MobileNativeChatBackgroundTasks', () => ({
  MobileNativeChatBackgroundTasks: 'BackgroundTasks'
}))
vi.mock('../tasks/MobileNativeChatDockedTaskList', () => ({
  MobileNativeChatDockedTaskList: 'DockedTaskList'
}))

vi.mock('./MobileQueuedMessageComposer', () => ({
  MobileQueuedMessageComposer: 'QueuedMessageComposer'
}))

function card(
  overrides: Partial<MobileQueuedMessageCard> & { messageId: string }
): MobileQueuedMessageCard {
  const text = overrides.text ?? `text of ${overrides.messageId}`
  return {
    position: 1,
    text,
    line: text,
    state: 'waiting',
    hold: overrides.state === 'returned' ? 'returned' : 'turn',
    needsAttention: false,
    caption: null,
    ...overrides
  }
}

describe('the newest queued-message chord', () => {
  let renderer: ReactTestRenderer | null = null
  afterEach(async () => {
    vi.restoreAllMocks()
    act(() => renderer?.unmount())
    renderer = null
    await activateMobileUiLocale('en')
  })
  it('the empty chord presses only the newest card where its own button would, and offers it only while that press would act, across chat switches', async () => {
    let tray!: MobileNativeChatComposerTray
    function Tray(props: Parameters<typeof useMobileNativeChatComposerTray>[0]['queued']) {
      tray = useMobileNativeChatComposerTray({
        queued: props,
        taskList: null,
        backgroundTasks: null
      })
      return createElement('View', null, tray.content)
    }
    const settles: ((accepted: boolean) => void)[] = []
    const onSend = vi.fn(() => new Promise<boolean>((resolve) => settles.push(resolve)))
    const chatA = { sessionKey: 'a', cards: [card({ messageId: 'a1' }), card({ messageId: 'a2' })] }
    const chatB = { sessionKey: 'b', cards: [card({ messageId: 'b1' })] }
    const show = async (
      chat: typeof chatA,
      props: Partial<Parameters<typeof Tray>[0]> = {}
    ): Promise<void> => {
      await act(async () => {
        renderer ??= create(createElement('View'))
        renderer.update(createElement(Tray, { ...chat, agentWorking: true, onSend, ...props }))
      })
    }
    const press = (alternateSteers = true) => {
      let pressed = false
      act(() => {
        pressed = tray.steerHead!.run(alternateSteers)
      })
      return pressed
    }

    await show(chatA)
    expect(tray.steerHead!.steers(true)).toBe(true)
    expect(press()).toBe(true)
    expect(onSend).toHaveBeenLastCalledWith('a2')
    // On its way: neither offered nor admitted again, like a second tap.
    expect(tray.steerHead!.steers(true)).toBe(false)
    expect(press()).toBe(false)

    // Another chat's newest card is its own; A settling later must not clear B's hold.
    await show(chatB)
    expect(tray.steerHead!.steers(true)).toBe(true)
    expect(press()).toBe(true)
    await act(async () => settles[0]!(true))
    expect(tray.steerHead!.steers(true)).toBe(false)
    expect(press()).toBe(false)
    await act(async () => settles[1]!(true))
    expect(tray.steerHead!.steers(true)).toBe(true)

    // Back to A, whose list remounts: an action started there still holds until it settles.
    await show(chatA)
    expect(press()).toBe(true)
    await show(chatB)
    await show(chatA)
    expect(tray.steerHead!.steers(true)).toBe(false)
    expect(press()).toBe(false)
    await act(async () => settles[2]!(true))
    expect(tray.steerHead!.steers(true)).toBe(true)

    // No turn running (the paused queue after Stop): the newest card's own Send.
    await show(chatA, { agentWorking: false })
    expect(tray.steerHead!.steers(false)).toBe(true)
    const refusals: [Partial<Parameters<typeof Tray>[0]>, boolean][] = [
      [{}, false],
      [{ steerHeld: true }, true],
      [{ cards: [card({ messageId: 'a1' }), card({ messageId: 'a2', command: true })] }, true],
      [{ cards: [card({ messageId: 'a1' }), card({ messageId: 'a2', hold: 'sending' })] }, true],
      [{ cards: [card({ messageId: 'a1' }), card({ messageId: 'a2', hold: 'returned' })] }, true]
    ]
    for (const [props, alternateSteers] of refusals) {
      await show(chatA, props)
      expect(tray.steerHead!.steers(alternateSteers)).toBe(false)
      const sends = onSend.mock.calls.length
      expect(press(alternateSteers)).toBe(false)
      expect(onSend).toHaveBeenCalledTimes(sends)
    }
  })
})
