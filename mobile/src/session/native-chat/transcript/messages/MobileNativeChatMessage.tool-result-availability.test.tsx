import { foldMobileNativeChatMessages } from '../projection/mobile-native-chat-render-data'
import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  NativeChatMessage,
  NativeChatToolCallBlock
} from '../../../../../../src/shared/native-chat/native-chat-types'

vi.mock('react-native', async () => {
  const React = await import('react')
  const Text = ({ children, ...props }: { children?: ReactNode }): ReactNode =>
    React.createElement('Text', props, children)
  return {
    AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
    ActivityIndicator: 'ActivityIndicator',
    Animated: {
      Text,
      Value: class {
        setValue(): void {}
      },
      loop: (animation: unknown) => animation,
      sequence: () => ({ start: vi.fn(), stop: vi.fn() }),
      timing: () => ({ start: vi.fn(), stop: vi.fn() })
    },
    Image: 'Image',
    Platform: { OS: 'ios' },
    Pressable: 'Pressable',
    ScrollView: ({ children, ...props }: { children?: ReactNode }) =>
      React.createElement('ScrollView', props, children),
    Text,
    View: ({ children, ...props }: { children?: ReactNode }) =>
      React.createElement('View', props, children),
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
    useWindowDimensions: () => ({ width: 400, height: 800 })
  }
})
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }))
vi.mock('lucide-react-native', () => ({
  ArrowUp: 'ArrowUp',
  Bot: 'Bot',
  Brain: 'Brain',
  Check: 'Check',
  ChevronDown: 'ChevronDown',
  ChevronRight: 'ChevronRight',
  Clock: 'Clock',
  Copy: 'Copy',
  Eye: 'Eye',
  FileMinus2: 'FileMinus2',
  FilePen: 'FilePen',
  FilePlus2: 'FilePlus2',
  Folder: 'Folder',
  Globe: 'Globe',
  Hourglass: 'Hourglass',
  ListChecks: 'ListChecks',
  MessageSquareMore: 'MessageSquareMore',
  Pencil: 'Pencil',
  Play: 'Play',
  Plug: 'Plug',
  Search: 'Search',
  Send: 'Send',
  SquareChevronRight: 'SquareChevronRight',
  SquareTerminal: 'SquareTerminal',
  Webhook: 'Webhook',
  Wrench: 'Wrench',
  Zap: 'Zap'
}))
vi.mock('../../../../components/markdown/MobileMarkdown', () => ({
  MobileMarkdown: 'MobileMarkdown'
}))
vi.mock('../../../../components/code-presentation/MobileSourceCopyButton', () => ({
  MobileSourceCopyButton: 'CopyButton'
}))
vi.mock('../message-actions/MobileNativeChatMessageActionsSheet', () => ({
  MobileNativeChatMessageActionsSheet: 'MessageActionsSheet'
}))

import { MobileNativeChatMessage } from './MobileNativeChatMessage'

function message(blocks: NativeChatMessage['blocks']): NativeChatMessage {
  return { id: 'source', role: 'assistant', blocks, timestamp: 1, source: 'transcript' }
}

function textIn(node: ReactTestInstance): string[] {
  return node
    .findAll((child) => String(child.type) === 'Text')
    .map((child) =>
      child.children
        .flatMap((part) =>
          typeof part === 'string' || typeof part === 'number' ? [String(part)] : []
        )
        .join('')
    )
}

function button(root: ReactTestInstance, label: string): ReactTestInstance {
  return root.find((node) => String(node.type) === 'Pressable' && textIn(node).includes(label))
}

function toolLines(root: ReactTestInstance): ReactTestInstance[] {
  return root
    .findAll((node) => String(node.type) === 'ScrollView')
    .flatMap((box) => box.findAll((node) => String(node.type) === 'Pressable'))
}

function allText(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === 'string' ? child : allText(child))).join('')
}

function occurrences(text: string, part: string): number {
  return text.split(part).length - 1
}

const LONG_COMMAND = `printf '%s' ${Array.from({ length: 12 }, (_, index) => `'argument-${index}'`).join(' ')} END_OF_COMMAND`

function press(node: ReactTestInstance): void {
  act(() => {
    node.props.onPress()
  })
}

describe('mobile tool result availability', () => {
  let renderer: ReactTestRenderer | null = null

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    vi.restoreAllMocks()
  })

  function render(row: NativeChatMessage): ReactTestRenderer {
    act(() => {
      renderer = create(createElement(MobileNativeChatMessage, { message: row }))
    })
    press(
      renderer!.root.find(
        (node) =>
          String(node.type) === 'Pressable' && node.props.accessibilityLiveRegion === 'polite'
      )
    )
    return renderer!
  }

  it('gives a named completion to its own call past silent calls, not to the first', () => {
    const calls: NativeChatMessage['blocks'] = Array.from({ length: 18 }, (_, index) => ({
      type: 'tool-call',
      callId: `call-${index}`,
      name: 'Bash',
      input: { command: `command ${index}` }
    }))
    const raw = message([
      ...calls,
      { type: 'tool-result', callId: 'call-17', output: 'late named output' }
    ])
    const [row] = foldMobileNativeChatMessages([raw], 'claude')
    const tree = render(row!)
    expect(toolLines(tree.root)).toHaveLength(18)
    expect(textIn(tree.root)).not.toContain('late named output')
    press(button(tree.root, 'command 17'))
    expect(textIn(tree.root)).toContain('late named output')
    press(button(tree.root, 'command 17'))
    expect(button(tree.root, 'command 0').props.disabled).toBe(false)
    press(button(tree.root, 'command 0'))
    expect(textIn(tree.root)).not.toContain('late named output')
  })

  function openedCall(block: NativeChatToolCallBlock, callId: string) {
    const tree = render(message([{ ...block, callId }]))
    for (const line of toolLines(tree.root)) {
      press(line)
    }
    const member = tree.root.findAll(
      (node) => node.props.testID === `chat-member:call:${callId}`
    )[0]!
    return {
      tree,
      texts: textIn(member),
      text: allText(member),
      inputCopies: member
        .findAll((node) => String(node.type) === 'CopyButton')
        .filter((node) => node.props.accessibilityLabel === 'Copy input')
        .map((node) => String(node.props.text))
    }
  }

  it('draws an edit that has a diff as the diff alone, under its exact tool name', () => {
    const call = openedCall(
      {
        type: 'tool-call',
        name: 'Edit',
        state: 'running',
        input: {
          file_path: '/repo/src/total.ts',
          old_string: 'const total = before',
          new_string: 'const total = after'
        }
      },
      'edit'
    )
    expect(call.texts).toContain('Edit')
    expect(occurrences(call.text, 'const total = after')).toBe(1)
    expect(call.texts).not.toContain('Input')
    expect(call.inputCopies).toEqual([])
  })

  it.each([
    { name: 'the row shortened', command: LONG_COMMAND, worded: 1 },
    // The row words this one too.
    { name: 'the row shows whole', command: 'ls -la', worded: 2 }
  ])('draws a lone command $name once as a command, before any result', ({ command, worded }) => {
    const call = openedCall(
      { type: 'tool-call', name: 'Bash', state: 'running', input: { command } },
      'command'
    )
    expect(call.texts.filter((text) => text === 'Bash')).toHaveLength(1)
    expect(call.inputCopies).toEqual([])
    expect(call.texts).not.toContain('Input')
    expect(call.texts.some((text) => text.includes('"command"'))).toBe(false)
    expect(occurrences(call.text, command)).toBe(worded)
  })

  it('draws a command with other arguments as one input body, without a separate command', () => {
    const input = { cmd: LONG_COMMAND, workdir: '/repo', timeout_ms: 10000 }
    const call = openedCall({ type: 'tool-call', name: 'exec_command', input }, 'arguments')
    expect(call.texts).toContain('exec_command')
    expect(call.inputCopies).toEqual([JSON.stringify(input, null, 2)])
    expect(occurrences(call.text, 'END_OF_COMMAND')).toBe(1)
  })

  it('reveals a long input body in full on request', () => {
    const input = { message: `${'a'.repeat(4500)}END_OF_INPUT` }
    const call = openedCall({ type: 'tool-call', name: 'handoff', input }, 'large')
    expect(call.text).not.toContain('END_OF_INPUT')
    press(button(call.tree.root, 'Show full input'))
    expect(textIn(call.tree.root)).toContain(JSON.stringify(input, null, 2))
  })
})
