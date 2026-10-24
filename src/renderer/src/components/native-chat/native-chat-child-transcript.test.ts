import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { nativeChatChildTranscript } from './native-chat-child-transcript'

function message(id: string, agentId?: string, parentAgentId?: string): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [{ type: 'text', text: id }],
    timestamp: 1,
    source: 'transcript',
    ...(agentId === undefined ? {} : { agentId }),
    ...(parentAgentId === undefined ? {} : { parentAgentId })
  }
}

describe('a child conversation', () => {
  it('shows its own rows as a full conversation while retaining nested attribution', () => {
    const parent = message('parent')
    const child = message('child-output', 'child')
    const nested = message('nested-output', 'nested', 'child')
    const sibling = message('sibling-output', 'sibling')
    const rows = nativeChatChildTranscript([parent, child, nested, sibling], 'child')
    expect(rows.map((row) => row.id)).toEqual(['child-output', 'nested-output'])
    expect(rows[0]?.agentId).toBeUndefined()
    expect(rows[1]).toBe(nested)
    expect(child.agentId).toBe('child')
  })

  it('finds grandchildren regardless of page order and terminates on broken ownership cycles', () => {
    const rows = [
      message('grandchild', 'grandchild', 'nested'),
      message('nested', 'nested', 'child'),
      message('child', 'child', 'nested'),
      message('unrelated', 'other', 'other')
    ]
    expect(nativeChatChildTranscript(rows, 'child').map((row) => row.id)).toEqual([
      'grandchild',
      'nested',
      'child'
    ])
    expect(nativeChatChildTranscript(rows, 'missing')).toEqual([])
  })

  it('opens a legacy Codex background-task id at its bare thread journal without sibling rows', () => {
    const rows = nativeChatChildTranscript(
      [message('parent'), message('child', 'thread-a'), message('sibling', 'thread-b')],
      'codex-agent:thread-a'
    )
    expect(rows.map((row) => row.id)).toEqual(['child'])
    expect(rows[0]?.agentId).toBeUndefined()
  })
})
