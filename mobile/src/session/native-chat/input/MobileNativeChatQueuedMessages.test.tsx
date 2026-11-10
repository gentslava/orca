// @vitest-environment happy-dom
import { activateMobileUiLocale } from '../../../i18n/mobile-i18n'
import type { MobileQueuedMessageCard } from './mobile-structured-queued-message-cards'

import { createElement } from 'react'
import type * as QueuedCardRowModule from './MobileQueuedMessageCardRow'

import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MobileNativeChatQueuedMessages } from './MobileNativeChatQueuedMessages'
import {
  useMobileNativeChatComposerTray,
  type MobileNativeChatComposerTray
} from '../composer/use-mobile-native-chat-composer-tray'

const rowRenders = vi.hoisted(() => ({ count: 0 }))
vi.mock('./MobileQueuedMessageCardRow', async (importOriginal) => {
  const original = await importOriginal<typeof QueuedCardRowModule>()
  return {
    MobileQueuedMessageCardRow: (
      props: Parameters<typeof original.MobileQueuedMessageCardRow>[0]
    ) => {
      rowRenders.count++
      return createElement(original.MobileQueuedMessageCardRow, props)
    }
  }
})
let fontScale = 1
vi.mock('../../../components/DragReorderList', () => ({ DragReorderList: 'DragReorderList' }))
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

vi.mock('../../../components/ActionSheetModal', () => ({ ActionSheetModal: 'ActionSheetModal' }))
vi.mock('./MobileNativeChatBackgroundTasks', () => ({
  MobileNativeChatBackgroundTasks: 'BackgroundTasks'
}))
vi.mock('./MobileNativeChatDockedTaskList', () => ({
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

describe('MobileNativeChatQueuedMessages', () => {
  let renderer: ReactTestRenderer | null = null

  afterEach(async () => {
    vi.restoreAllMocks()
    act(() => renderer?.unmount())
    renderer = null
    await activateMobileUiLocale('en')
  })

  async function mount(
    props: Parameters<typeof MobileNativeChatQueuedMessages>[0]
  ): Promise<ReactTestRenderer> {
    const mounted = create(createElement('View'))
    renderer = mounted
    await act(async () => {
      mounted.update(createElement(MobileNativeChatQueuedMessages, props))
    })
    return mounted
  }

  function control(mounted: ReactTestRenderer, label: string, index = 0) {
    return mounted.root.findAll(
      (node) => typeof node.type === 'string' && node.props.accessibilityLabel === label
    )[index]!
  }

  function sheet(mounted: ReactTestRenderer) {
    return mounted.root.find((node) => String(node.type) === 'ActionSheetModal')
  }

  it("closes a card's menu for good once the card leaves, even if it comes back", async () => {
    const mounted = await mount({ cards: [card({ messageId: 'a' }), card({ messageId: 'b' })] })
    await act(async () =>
      mounted.root.findAllByProps({ accessibilityLabel: 'More actions' })[0]!.props.onPress()
    )
    expect(sheet(mounted).props.visible).toBe(true)
    await act(async () => {
      mounted.update(
        createElement(MobileNativeChatQueuedMessages, { cards: [card({ messageId: 'b' })] })
      )
    })
    expect(sheet(mounted).props.visible).toBe(false)
    await act(async () => {
      mounted.update(
        createElement(MobileNativeChatQueuedMessages, {
          cards: [card({ messageId: 'a' }), card({ messageId: 'b' })]
        })
      )
    })
    expect(sheet(mounted).props.visible).toBe(false)
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

  it('runs one action per card at a time, however fast its controls are tapped', async () => {
    let answer: (done: boolean) => void = () => undefined
    const onSend = vi.fn(() => new Promise<boolean>((resolve) => (answer = resolve)))
    const onDelete = vi.fn(async () => true)
    const mounted = await mount({ cards: [card({ messageId: 'w' })], onSend, onDelete })
    // Tap all actions before disabled state renders to expose same-frame duplication.
    await act(async () => {
      control(mounted, 'Send this message').props.onPress()
      control(mounted, 'Send this message').props.onPress()
      control(mounted, 'Delete this queued message').props.onPress()
    })
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onDelete).not.toHaveBeenCalled()
    expect(control(mounted, 'More actions').props.disabled).toBe(true)
    await act(async () => answer(true))
    expect(control(mounted, 'Send this message').props.disabled).toBe(false)
  })

  describe('a paused queue', () => {
    const waiting = card({ messageId: 'waiting-1', text: 'next' })

    async function mountPaused(
      props: Partial<Parameters<typeof MobileNativeChatQueuedMessages>[0]>
    ): Promise<ReactTestRenderer> {
      return mount({
        cards: [waiting],
        onSend: vi.fn(async () => true),
        onClearAll: vi.fn(async () => true),
        ...props
      })
    }

    function resumeButton(mounted: ReactTestRenderer) {
      return control(mounted, 'Resume sending the queued messages')
    }

    it('Resume admits one press at a time and releases a lost answer for retry', async () => {
      let answer: (resumed: boolean) => void = () => undefined
      const onResume = vi.fn(() => new Promise<boolean>((resolve) => (answer = resolve)))
      const mounted = await mountPaused({ pause: { reason: 'stopped' }, onResume })
      await act(async () => {
        resumeButton(mounted).props.onPress()
        resumeButton(mounted).props.onPress()
      })
      expect(onResume).toHaveBeenCalledOnce()
      expect(resumeButton(mounted).props.disabled).toBe(true)
      await act(async () => answer(false))
      expect(resumeButton(mounted).props.disabled).toBe(false)
      await act(async () => resumeButton(mounted).props.onPress())
      expect(onResume).toHaveBeenCalledTimes(2)
    })
  })
})
