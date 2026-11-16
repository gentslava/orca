import { foldMobileNativeChatMessages } from '../projection/mobile-native-chat-render-data'
import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../../../src/shared/native-chat/native-chat-types'

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
  Copy: 'Copy',
  Eye: 'Eye',
  FileMinus2: 'FileMinus2',
  FilePen: 'FilePen',
  FilePlus2: 'FilePlus2',
  Folder: 'Folder',
  Globe: 'Globe',
  ListChecks: 'ListChecks',
  MessageSquareMore: 'MessageSquareMore',
  Pencil: 'Pencil',
  Plug: 'Plug',
  Search: 'Search',
  SquareChevronRight: 'SquareChevronRight',
  SquareTerminal: 'SquareTerminal',
  Wrench: 'Wrench'
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
})
