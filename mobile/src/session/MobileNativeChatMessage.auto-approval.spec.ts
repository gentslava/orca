import { act, type ReactTestRenderer } from 'react-test-renderer'
import { expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import {
  COMPACT_APPROVAL_CASES,
  NON_COMPACT_APPROVAL_BLOCKS,
  approvalReviewBlock
} from '../../../src/shared/native-chat-activity.test-fixture'
import { colors } from '../theme/mobile-theme'
import { findAllByHostType } from '../test-support/react-test-renderer-host-nodes'

export function registerMobileNativeChatAutoApprovalTests(
  render: (message: NativeChatMessage) => ReactTestRenderer
): void {
  it.each(NON_COMPACT_APPROVAL_BLOCKS)(
    'keeps other notice text available without treating it as an automatic approval: $text',
    (block) => {
      const tree = render({
        id: 'ordinary',
        role: 'system',
        blocks: [block],
        timestamp: 0,
        source: 'transcript'
      })
      const texts = () => findAllByHostType(tree.root, 'Text').map((node) => node.children.join(''))
      const disclosures = findAllByHostType(tree.root, 'Pressable').filter(
        (node) => node.props.accessibilityState?.expanded !== undefined
      )
      if (block.tone === 'error') {
        expect(texts()).not.toContain(block.text)
        expect(disclosures).toHaveLength(1)
        act(() => disclosures[0]?.props.onPress())
      } else {
        expect(disclosures).toHaveLength(0)
      }
      expect(texts()).toContain(block.text)
    }
  )

  it.each([
    ...COMPACT_APPROVAL_CASES,
    { block: approvalReviewBlock(), label: 'Automatic approval granted' }
  ])('discloses $label without showing the original rejection by default', ({ block, label }) => {
    const tree = render({
      id: 'denial',
      role: 'system',
      blocks: [block],
      timestamp: 0,
      source: 'transcript'
    })
    const texts = () => findAllByHostType(tree.root, 'Text').map((node) => node.children.join(''))
    const trigger = findAllByHostType(tree.root, 'Pressable').find(
      (node) => node.props.accessibilityState?.expanded !== undefined
    )!
    expect(texts()).toContain(label)
    expect(texts()).not.toContain(block.text)
    const labelNode = findAllByHostType(tree.root, 'Text').find(
      (node) => node.children.join('') === label
    )!
    expect(Object.assign({}, ...[labelNode.props.style].flat(Infinity).filter(Boolean)).color).toBe(
      colors.textMuted
    )
    expect(trigger.props.accessibilityState.expanded).toBe(false)
    expect(trigger.props['aria-expanded']).toBe(false)
    act(() => trigger.props.onPress())
    expect(texts()).toContain(block.text)
    if (block.tone === 'error') {
      const detail = findAllByHostType(tree.root, 'Text').find(
        (node) => node.children.join('') === block.text
      )!
      expect(Object.assign({}, ...[detail.props.style].flat(Infinity).filter(Boolean)).color).toBe(
        colors.statusRed
      )
    }
    expect(texts()).toContain(block.providerFrame!.payload.head)
    expect(trigger.props.accessibilityState.expanded).toBe(true)
    expect(trigger.props['aria-expanded']).toBe(true)
    act(() => trigger.props.onPress())
    expect(texts()).not.toContain(block.text)
    expect(trigger.props.accessibilityState.expanded).toBe(false)
    expect(trigger.props['aria-expanded']).toBe(false)
  })
}
